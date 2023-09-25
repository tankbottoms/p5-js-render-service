import express, { Request, Response } from "express";
import puppeteer, { Page } from 'puppeteer';
import fetch from 'cross-fetch';
import { getCollection, sendMessage, updateCollection, updateNotification, updateProgress } from './firebase';
import { generateP5Html } from './p5Template';
import PQueue from 'p-queue';
import pinningSevice, { IPFSPinReponse } from './ipfs';
import { BASE_DIR, Task, TaskState } from './task';
import { NftStatus, PinningStates } from './types';
import { log } from "./logging";
import fs from "fs";
import cors from "cors";
import { pollCheckTasks } from "./polling";

const PORT = 8080;
const app = express();

app.use(cors({
    origin: '*',
    optionsSuccessStatus: 200
}))
app.use(express.json());
app.use(express.urlencoded());

app.post('/task', createTask);
app.delete('/task/:userId/:collectionId', deleteTask);

app.listen(PORT, () => {
    console.log(`Server http://localhost:${PORT}`);
    pollCheckTasks();
});

async function createTask(req: Request, res: Response) {
    const userId = req.body.userId;
    const collectionId = req.body.collectionId;
    const nftId = req.body.nftId;
    const collection = await getCollection(collectionId);
    if (!collection) {
        // TODO: handle collection not found error
        return;
    }

    const task = new Task(userId, collectionId, nftId, Date.now());
    task.initialize(TaskState.Waiting);
    updateNotification(collectionId, PinningStates.QUEUED);
    res.status(202).json({
        message: "Task queued",
    });

    sendMessage(
        userId,
        "Collection nft is queued for pinning",
        collection.id,
        collection.network
    );
    log.info("Task queued for: ", collectionId);
}

async function deleteTask(req: Request, res: Response) {
    const { collectionId, userId } = req.params;
    try {
        log.info(`Deleting task for ${userId} and ${collectionId}`);
        const tasks = fs.readdirSync(BASE_DIR)
            .filter(filename => filename.startsWith(`${userId.toLowerCase()}:${collectionId}`))
            .map(filename => Task.fromString(filename.replace('.json', '')));
        const collection = await getCollection(collectionId);
        for (const task of tasks) {
            task.setState(TaskState.Canceled);
            updateNotification(collection.id, PinningStates.FAILED);
        }
        updateNotification(collection.id, PinningStates.FAILED);
        res.status(200).json({
            message: "Task deleted",
        });
    } catch (e) {
        res.status(500).json({
            message: "Failed to delete task",
        });
    }
}

// handle();

export async function processTask(task: Task) {

    const updateProgressCallback = (progress: number, remainingTime: number, pinnedCount: number, totalCount: number) =>
        updateProgress(collection.id, progress, remainingTime, pinnedCount, totalCount);
    function handleerror() {
        console.log(`while updating collection nft not found`,);
        sendMessage(
            task.userId,
            'Something went wrong while processing collection',
            collection.id,
            collection.network
        );
        updateNotification(collection.id, PinningStates.FAILED);
    }
    const collectionId = task.collectionId;
    const nftId = task.nftId;
    const collection = await getCollection(collectionId);
    if (!collection) {
        log.failed('collection not found!');
        // res.send('collection not found');
        return null;
    }
    let total = 0;
    let pins: Record<string, { Hash: string, Size: number }> = {};
    const nft = collection.nfts.find(nft => nft._id === nftId);
    if (!nft) {
        // Todo: handle nft not found
        log.failed('nft not found in collection');

        fs.rmSync(`/data/${task.task}.json`, { force: true });
        log.warn(`deleting task of collection ${task.collectionId}`);
    } else {
        const scriptUrl = <string>nft['script'];
        const response = await fetch(scriptUrl);
        const script = await response.text();
        const pinsPromises: Promise<IPFSPinReponse>[] = [];

        let stopped = false;
        let doneCount = 0;
        const startedAt = Date.now();
        let lastMessageAt = 0;
        let lastUpdateAt = 0;
        const result = await renderScript(script, nft.totalSupply, async (file, i, stop) => {
            if (stopped) return;
            total += 1;
            console.log('Processed:', total, 'Pinned:', Object.keys(pins).length, `Of total ${nft.totalSupply}`);
            const promise = pinningSevice.pinFile(file);
            pinsPromises.push(promise);
            const pinResponse = await promise;
            pins[`${i + 1}.png`] = { Hash: pinResponse.Hash, Size: file.length };
            doneCount++;
            if (task.getState() === TaskState.Canceled) {
                stopped = true;
                return stop();
            } else {
                if (Date.now() - lastUpdateAt > 3_000) {
                    updateProgressCallback(Math.floor((doneCount / nft.totalSupply) * 100), ((Date.now() - startedAt) / doneCount) * (nft.totalSupply - doneCount), doneCount, nft.totalSupply);
                    lastUpdateAt = Date.now();
                }
                if (Date.now() - lastMessageAt > 10_000) {
                    sendMessage(task.userId, `Rendered ${doneCount} out of ${nft.totalSupply} ${collection.symbol ?? 'nft'}s`, task.collectionId, collection.network);
                    lastMessageAt = Date.now();
                }
            }
        });
        const taskCanceled = task.getState() === TaskState.Canceled;
        if (!result || taskCanceled) {
            if (!taskCanceled) handleerror();
            fs.rmSync(`/data/${task.task}.json`, { force: true, recursive: true, maxRetries: 5 });
            console.log(`deleting task of collection ${task.collectionId}`);
            sendMessage(
                task.userId,
                `NFT rendering stopped`,
                collection.id,
                collection.network
            );
            return;
        }
        console.log('waiting for pinning to finish');
        await Promise.all(pinsPromises);
        console.log('Processed:', total, 'Pinned:', pinsPromises.length);

        const finalCid = await pinningSevice.dagPbFolder(Object.entries(pins).map(([name, val]) => ({ Hash: val.Hash, Name: name, TSize: Number(val.Size) ?? 1 })));

        console.log(`Pinned folder: ${finalCid}`,);

        if (finalCid) {
            const collection = await getCollection(task.collectionId);
            const nft = collection.nfts.find(nft => nft._id === nftId);
            if (nft) {
                nft._status = NftStatus.SAVED;
                nft.ipfs = {
                    IpfsHash: finalCid,
                    PinSize: 0,
                    Timestamp: Date.now().toString(),
                }
                updateCollection(task.collectionId, collection);
                console.log(`Updated collection`,);
                sendMessage(task.userId, `Rendered all ${nft.totalSupply} ${collection.symbol ?? 'nft'}s`, task.collectionId, collection.network);
                // TODO: handle task complete
            }
        } else {
            handleerror();
        }

        fs.rmSync(`/data/${task.task}.json`, { force: true });
        log.warn(`deleting task of collection ${task.collectionId}`);

    }
}

async function renderScript(script: string, count: number, callback: (image: Buffer, index: number, stop: () => void) => void) {
    const MAX_PAGES = 15;
    const startTime = Date.now();


    const html = generateP5Html(script);
    const browser = await puppeteer.launch({
        headless: true,
        ignoreDefaultArgs: [
            "--mute-audio",
        ],
        args: [
            "--autoplay-policy=no-user-gesture-required",
            "--no-sandbox"
        ],
        defaultViewport: { width: 1024, height: 1024, deviceScaleFactor: 1, hasTouch: false }
    });
    const pages = [(await browser.pages())[0], ...(await Promise.all(Array(MAX_PAGES - 1).fill(0).map(() => browser.newPage())))];

    // Navigate the page to a URL

    for (const page of pages) {
        await page.setContent(`<html><head><script></script></head><body></body></html>`);
        await page.waitForNetworkIdle();
    }

    function render(page: Page) {
        return page.evaluate(async (source: string) => {
            const iframe = document.createElement('iframe');
            let canvas: HTMLCanvasElement | null = null;
            iframe.id = `p5js-iframe-${Date.now()}`;
            iframe.srcdoc = source;
            iframe.style.position = 'fixed';
            iframe.style.top = '0px';
            iframe.style.left = '0px';
            iframe.style.width = '1024px';
            iframe.style.height = '1024px';
            iframe.style.opacity = '1';
            document.body.appendChild(iframe);
            try {
                return await new Promise<any>((resolve, reject) => {
                    iframe.onload = async () => {
                        for (let tries = 0; tries < 25; tries++) {
                            try {
                                if (!iframe.contentDocument) { continue }
                                canvas = iframe.contentDocument.querySelector('canvas');
                                if (canvas) {
                                    let base64Image = '';
                                    const context = canvas.getContext('2d');
                                    const { width, height } = canvas;
                                    if (context) {
                                        const imageData = context.getImageData(0, 0, width, height);
                                        const { data } = imageData;
                                        const isPopulated = data.some((pixel) => pixel !== 0);
                                        if (isPopulated) {
                                            base64Image = canvas.toDataURL();
                                        }
                                    }

                                    const webGl = canvas.getContext('webgl');
                                    if (webGl) {
                                        const pixels = new Uint8Array(width * height * 4);
                                        webGl.readPixels(0, 0, width, height, webGl.RGBA, webGl.UNSIGNED_BYTE, pixels);
                                        const isPopulated = pixels.some((pixel) => pixel !== 0);
                                        if (isPopulated) {
                                            base64Image = canvas.toDataURL();
                                        }
                                    }

                                    if (base64Image.length) {
                                        iframe.remove();
                                        resolve(base64Image.split(',')[1]);
                                        break;
                                    }
                                }
                            } catch (e) {
                                reject(e);
                                break;
                            }
                            await new Promise(r => setTimeout(r, 200));
                        }
                        reject('failed to render');
                    };
                });
            } catch (error) {
                return { error };
            }
        }, html);
    }
    const queue = new PQueue({ concurrency: MAX_PAGES });
    let errored = false;
    for (let i = 0; i < count && !errored; i++) {
        queue.add(async () => {
            if (errored) return;
            const base64Image = await render(pages[i % MAX_PAGES]);
            if (base64Image.error) {
                console.log('error', base64Image.error);
                errored = true;
            } else {
                void callback(Buffer.from(base64Image, 'base64'), i, () => {
                    log.warn('user canceled the process');
                    errored = true;
                });
            }
        });
    }
    if (errored) return false;
    await queue.onIdle();
    if (errored) return false;
    console.log(`all ${count} done in`, Math.floor((Date.now() - startTime) / 1000), 's');
    await browser.close();
    return true;
}
