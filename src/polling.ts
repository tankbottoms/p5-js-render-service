import { log } from "./logging";
import { BASE_DIR, Task, TaskState } from "./task";
import { processTask } from "./index";
import fs from "fs";


const MAX_CONCURRENT_TASKS = 1;
const POLL_INTERVAL = 10000;

let lastLog = '0:0';
export async function pollCheckTasks() {
    while (true) {
        const tasks = fs.readdirSync(BASE_DIR)
            .filter(name => {
                if (name === 'lost+found') return false;
                return fs.statSync(`${BASE_DIR}/${name}`).isFile() && name.endsWith('.json');
            })
            .map(filename => ({
                path: `${BASE_DIR}/${filename}`,
                userId: filename.split(':')[0],
                collectionId: filename.split(':')[1],
                nftId: filename.split(':')[2],
                timestamp: Number(filename.split(':')[3].replace('.json', '')),
            }))
            .filter(obj => obj.collectionId && obj.userId && obj.nftId)
            .map(obj => new Task(obj.userId, obj.collectionId, obj.nftId, obj.timestamp))
            .sort((a, b) => b.timestamp - a.timestamp)
            .filter(task => task.getState() !== TaskState.Canceled);

        const pendingTasks = tasks.filter(task => task.getState() === TaskState.Pending);
        const waitingTasks = tasks.filter(task => task.getState() !== TaskState.Pending)
            .map(task => {
                task.setState(TaskState.Waiting);
                return task;
            });

        if (pendingTasks.length < MAX_CONCURRENT_TASKS) {
            const task = waitingTasks.pop();
            if (task?.toString()) {
                pendingTasks.push(task);
                task.setState(TaskState.Pending);
                processTask(task);
            }
        }

        if (lastLog !== `${pendingTasks.length}:${tasks.length}`) {
            log.info(`Currently processing ${pendingTasks.length} tasks of ${tasks.length} total tasks`);
            lastLog = `${pendingTasks.length}:${tasks.length}`
        }

        // Wait for a certain amount of time before polling the queue again
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }
}