import fs from "fs";
// import Redis from "ioredis";
import type { IPFSPinReponse } from "./ipfs";

export const BASE_DIR = '/data'

export enum TaskState {
  Canceled = -2,
  Waiting = 0,
  Pending = Date.now(),
}


type TaskFileRecord = {
  metadata: {
    state: TaskState
  },
  pinnings: {
    [name: string]: Record<string, IPFSPinReponse>
  }
}

export class Task {
  readonly task: string;
  readonly userId: string;
  readonly collectionId: string;
  readonly nftId: string;
  readonly timestamp: number;

  constructor(userId: string, collectionId: string, nftId: string, timestamp: number) {
    this.task = `${userId.toLowerCase()}:${collectionId}:${nftId}:${timestamp}`;
    this.userId = userId.toLowerCase();
    this.collectionId = collectionId;
    this.nftId = nftId;
    this.timestamp = timestamp;
  }

  initialize(state: TaskState) {
    this.updateCollectionFileSync(obj => {
      obj.metadata = obj.metadata ?? {};
      obj.pinnings = obj.pinnings ?? {};
      return obj;
    })
    this.setState(state);
  }

  static fromString(task: string): Task {
    const [userId, collectionId, nftId, timestamp] = task.split(":");
    return new Task(userId, collectionId, nftId, Number(timestamp));
  }

  toString(): string {
    return this.task;
  }

  getFilePath() {
    return `${BASE_DIR}/${this.task}.json`
  }

  getCollectionFile(): TaskFileRecord | void {
    const filePath = this.getFilePath();
    if (!fs.existsSync(filePath)) {
      return undefined;
    }
    const content = fs.readFileSync(filePath).toString();
    const json = JSON.parse(content);
    json.metadata = json.metadata ?? {};
    json.pinnings = json.pinnings ?? {};
    return json;
  }

  async updateCollectionFile(updater: (obj: TaskFileRecord) => TaskFileRecord | undefined | Promise<TaskFileRecord | undefined> = e => e) {
    const filePath = this.getFilePath();
    let record = this.getCollectionFile();
    if (!record) record = { metadata: { state: TaskState.Waiting }, pinnings: {} };
    const updatedFileContent = await updater(record);
    if (updatedFileContent !== undefined) {
      fs.writeFileSync(filePath, JSON.stringify(updatedFileContent, null, ' '));
    }
  }

  updateCollectionFileSync(updater: (obj: TaskFileRecord) => (TaskFileRecord | undefined) = e => e) {
    const filePath = this.getFilePath();
    let record = this.getCollectionFile();
    if (!record) record = { metadata: { state: TaskState.Waiting }, pinnings: {} };
    const updatedFileContent = updater(record);
    if (updatedFileContent !== undefined) {
      fs.writeFileSync(filePath, JSON.stringify(updatedFileContent, null, ' '));
    }
  }

  getState() {
    return this.getCollectionFile()?.['metadata']['state'];
  }
  setState(state: TaskState) {
    return this.updateCollectionFileSync(obj => {
      obj.metadata = obj.metadata ?? {};
      obj.metadata.state = state;
      return obj;
    })
  }
}