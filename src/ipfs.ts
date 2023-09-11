import { existsSync } from "fs";
import { config } from "dotenv";
import { log } from "./logging";
import FormData from "form-data";
import fetch from "cross-fetch";
import { create, CID, IPFSHTTPClient } from "ipfs-http-client";
import { fileSizeString, toBase64 } from "./conversion";
import PQueue from "p-queue";

if (process.env.NODE_ENV === "dev") {
    const localEnvPath = `${process.cwd()}/.env.local`;
    const dotEnvPath = `${process.cwd()}/.env.local`;
    const envPath = existsSync(localEnvPath) ? localEnvPath : dotEnvPath;
    config({ path: envPath });
} else {
    config();
}

const { INFURA_IPFS_API_KEY, INFURA_IPFS_API_KEY_SECRET } = process.env;

type DagPBLink = {
    Name: string,
    Hash: string,
    TSize: number
};
enum QueueState {
    STOPPED = 0,
    RUNNING = 1
};

type QueueItem = {
    id: string;
    buffer: Buffer;
    respond: Function;
}

export type IPFSPinReponse = {
    Name: string;
    Hash: string;
    Size: string;
}

export class PinningService {
    private readonly authHeader: string;
    readonly ipfsClient: IPFSHTTPClient;
    private pinQueue: QueueItem[] = [];
    private queueState = QueueState.STOPPED;
    private readonly MAX_FILES_PER_REQUEST = 250;
    // 100;
    private readonly MAX_REQUEST_SIZE = 250_000_000;

    constructor(infuraApiKey: string, infuraApiSecret: string, perRequestPinLimit: number) {
        if (!infuraApiKey || !infuraApiSecret) {
            throw Error('infura api keys not provided');
        }
        const authHeader = `Basic ${toBase64(`${infuraApiKey}:${infuraApiSecret}`)}`;
        this.authHeader = authHeader;
        this.ipfsClient = create({
            host: "ipfs.infura.io",
            port: 5001,
            protocol: "https",
            headers: {
                authorization: authHeader,
            },
        });
    }

    async startQueue() {
        if (this.queueState === QueueState.STOPPED) {
            this.queueState = QueueState.RUNNING;
            while (true) {
                if (this.pinQueue.length === 0) { this.queueState = QueueState.STOPPED; break; }
                let pins = this.pinQueue.reduce((acc, pin) => {
                    if (acc.length >= this.MAX_FILES_PER_REQUEST) return acc;
                    if (acc.length === 0 || ((acc.reduce((total, p) => total + p.buffer.length, 0) + pin.buffer.length) <= this.MAX_REQUEST_SIZE)) {
                        acc.push(pin);
                    }
                    return acc;
                }, <QueueItem[]>[]);
                log.info(`attempting to pin ${pins.length} files`);
                for (let attempt = 1; attempt <= 5; attempt++) {
                    const formData = new FormData();
                    for (const pin of pins) {
                        formData.append('file', pin.buffer, pin.id);
                    }
                    try {
                        const infuraEndpoint = "https://ipfs.infura.io:5001/api/v0"
                        const response = await fetch(
                            `${infuraEndpoint}/add?recursive=false&pin=true&cid-version=0&wrap-with-directory=false`,
                            {
                                method: "POST",
                                headers: {
                                    Authorization: this.authHeader,
                                },
                                body: <string>(<unknown>formData),
                            }
                        );
                        const textResponse = await response.text();
                        const pinnedResponse = textResponse.split('\n').map(line => line.trim()).filter(Boolean).map(line => <IPFSPinReponse>JSON.parse(line));
                        for (const pin of pins) {
                            const matchedResult = pinnedResponse.find(p => p.Name === pin.id);
                            if (matchedResult?.Hash) {
                                this.pinQueue = this.pinQueue.filter(p => p.id !== pin.id);
                                pins = pins.filter(p => p.id !== pin.id);
                                pin.respond(matchedResult);
                            }
                        }
                        break;
                    } catch (error) {
                        log.failed(`Attempt ${attempt} failed to pin ${pins.length} files: ${(<Error>error).message}`)
                        if (attempt === 5) {
                            for (const pin of pins) {
                                this.pinQueue = this.pinQueue.filter(p => p.id !== pin.id);
                                pins = pins.filter(p => p.id !== pin.id);
                                pin.respond(undefined, error);
                            }
                        }
                    }
                }
            }
        }
    }

    async dagPbFolder(links: DagPBLink[]) {
        const ipfsFolder = {
            Data: Buffer.from(`CAE=`, "base64"),
            Links: links
                .map((link) => ({
                    Hash: typeof link.Hash === "string" ? CID.parse(link.Hash) : link.Hash,
                    Name: link.Name,
                    Tsize: link.TSize || 1,
                }))
                .sort((a, b) => (a.Name < b.Name ? -1 : 1)),
        };

        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                const cid = await this.ipfsClient.dag.put(ipfsFolder, {
                    storeCodec: "dag-pb",
                    pin: true,
                    hashAlg: "sha2-256",
                    version: 1
                });

                return cid.toString();
            } catch (error) {
                log.failed(`Attempt ${attempt} failed to pin folder: ${(<Error>error).message}`)
                if (attempt === 5) {
                    throw error;
                }
            }
        }
    }

    pinFile(content: string | Buffer | Uint8Array, v = false): Promise<IPFSPinReponse> {
        return new Promise(async (resolve, reject) => {
            const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
            const buffer = Buffer.from(content);
            content = '';
            this.pinQueue.push({
                id, buffer, respond: async (ipfsResp: IPFSPinReponse, error?: Error) => {
                    if (ipfsResp && ipfsResp.Hash) resolve(ipfsResp);
                    else reject(error);
                }
            });
            if (v) log.info(`file (size=${fileSizeString(buffer.length)}) enqueued for pinning`);
            await new Promise(r => setTimeout(r, 1));
            this.startQueue();
        });
    }
}


const pinningSevice = new PinningService(<string>INFURA_IPFS_API_KEY, <string>INFURA_IPFS_API_KEY_SECRET, 50);
export default pinningSevice;


export class IpfsInterface {
    private readonly NUM_OF_CIDS_PER_REQUEST = 128;
    queue: { id: string, cidPath: string, status: 0 | 1 | 2, settle: (error: Error | undefined, data?: Blob) => any }[] = [];
    RUNNING = false;
    fetch(cidPath: string) {
        return new Promise<Blob>((resolve, reject) => {
            this.queue.push({
                id: Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36),
                cidPath,
                status: 0,
                settle(error: Error | undefined, data?: Blob) {
                    if (error || !data) {
                        return reject(error ?? new Error('empty response'));
                    }
                    return resolve(data);
                }
            });
            if (!this.RUNNING) {
                this.RUNNING = true;
                setTimeout(() => this.process(), 100);
            }
        });
    }
    async process() {
        this.RUNNING = true;
        const getPending = () => this.queue.filter(request => request.status === 0);
        const pqueue = new PQueue({ concurrency: 3 });

        for (let pendingRequests = getPending(); pendingRequests.length > 0; pendingRequests = getPending()) {
            const requestCids = [...new Set(pendingRequests.map(req => req.cidPath))];
            for (let i = 0; i < requestCids.length; i += this.NUM_OF_CIDS_PER_REQUEST) {
                const chosenCids = requestCids.slice(i, i + this.NUM_OF_CIDS_PER_REQUEST);
                if (chosenCids.length === 0) break;

                pqueue.add(async () => {
                    const gateway = new URL('https://ipfs-multiple-cids-gateway.juicebox.workers.dev/ipfs/');
                    for (const cid of chosenCids) {
                        const request = this.queue.find(({ cidPath }) => cidPath === cid);
                        if (request) {
                            request.status = 1;
                            gateway.searchParams.append('cid', cid);
                        }
                    }
                    log.info(`Fetching ${chosenCids.length} assets`);
                    let buffer: Buffer = Buffer.from([]);
                    for (let i = 0; i < 5; i++) {
                        try {
                            const response = await fetch(gateway.href);
                            buffer = Buffer.from(await response.arrayBuffer());
                            break;
                        } catch (error) {
                            if (i === 4) {
                                log.failed((<Error>error).message);
                                throw error;
                            } else {
                                log.warn(`Fetching failed retrying ${i + 1}`);
                            }
                        }
                    }
                    const files: { startIndex: number, length: number, cidPath: string }[] = [];
                    for (let i = 0; i < buffer.length; i++) {
                        const chunk = buffer.slice(i, i + 128).toString();
                        const startMatch = chunk.match(/^[$]{3,3}IPFS\/([^:]+):/);
                        if (startMatch) {
                            const cidPath = startMatch[1];
                            if (chosenCids.includes(cidPath)) {
                                files.push({ startIndex: i + startMatch[0].length, length: 0, cidPath: cidPath });
                                continue;
                            }
                        }
                        const endMatch = chunk.match(/^\/[$]{3,3}IPFS/);
                        if (endMatch) {
                            if (files[files.length - 1] && files[files.length - 1].length == 0) {
                                files[files.length - 1].length = i - files[files.length - 1].startIndex;
                                continue;
                            }
                        }
                    }
                    log.info(`fetch ${files.length} assets`);
                    let count = 0;
                    for (const file of files) {
                        const matchedRequests = this.queue.filter(req => req.status < 2 && req.cidPath === file.cidPath);
                        if (matchedRequests.length) {
                            count++;
                            for (const request of matchedRequests) {
                                const blob = new Blob([(buffer.slice(file.startIndex, file.startIndex + file.length))]);
                                request.status = 2;
                                this.queue = this.queue.filter(q => q.id !== request.id);
                                request.settle(undefined, blob);
                            }
                        }
                    }
                });
            }
            await pqueue.onIdle();
        }
        for (const failedReq of this.queue.filter(q => q.status === 1)) {
            failedReq.settle(new Error(`failed ${failedReq.cidPath}`));
            this.queue = this.queue.filter(q => q.id !== failedReq.id);
        }
        this.queue = this.queue.filter(req => req.status < 2);
        this.RUNNING = false;
    }
}

export const ipfsService = new IpfsInterface();
