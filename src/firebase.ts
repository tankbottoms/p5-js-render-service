import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { PfpCollection, PinningStates } from "./types";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import { log } from "./logging";


const DATABASE_URL =
    process.env.DATABASE_URL ||
    "https://juicebox-svelte-default-rtdb.firebaseio.com";
const COLLECTION_NAME = process.env.NOTIFICATIONS_TOPIC || "notifications";

const fbApp = initializeApp({
    credential: cert("./service-account.json"),
    databaseURL: DATABASE_URL,
});


let database: ReturnType<typeof getDatabase>;
try {
    database = getDatabase(fbApp);
} catch (e) {
    throw Error("Database not initialized");
}

let store: ReturnType<typeof getFirestore> | undefined;
try {
    store = getFirestore(fbApp);
    store.settings({
        ignoreUndefinedProperties: true,
    });
} catch (e) {
    log.warn("Firestore not initialized", e);
}

let messaging: ReturnType<typeof getMessaging> | undefined;
try {
    messaging = getMessaging(fbApp);
} catch (e) {
    log.warn("Messaging not initialized", e);
}

const notifications = store?.collection(COLLECTION_NAME);

export async function getCollection(id: string): Promise<PfpCollection> {
    const ref = database.ref(`collections/${id}`);
    const data = (await ref.get()).val() as PfpCollection;
    return data;
}

export async function getCollectionById(id: string) {
    const snapshot = await database.ref('collections').orderByChild('id').equalTo(id).get()

    if (snapshot.exists()) {
        const value = snapshot.val();

        for (const key in value) {
            return { ...value[key], firebaseId: key } as PfpCollection;
        }
    } else {
        return null;
    }
}

export async function updateCollection(id: string, data: PfpCollection) {
    const ref = database.ref(`collections/${id}`);
    await ref.set(data);
}

export async function updateNotification(
    collectionId: string,
    message: PinningStates
) {
    const maxRetries = 5;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (!notifications) return;
            const doc = (await notifications.doc(collectionId).get()).data();
            if (doc) {
                await notifications.doc(collectionId).set({
                    ...doc,
                    state: message,
                    progress: [PinningStates.DONE, PinningStates.FAILED].includes(message)
                        ? 0
                        : doc.progress,
                });
            }
            // If the operation is successful, break out of the loop
            break;
        } catch (error) {
            console.error(
                `Error updating notification for collection ${collectionId} on attempt ${attempt}:`,
                error
            );
            // If this was the last attempt, rethrow the error
            if (attempt === maxRetries) throw error;
            // Otherwise, wait a bit before retrying
            await new Promise((resolve) => setTimeout(resolve, attempt * 1000)); // wait for attempt seconds
        }
    }
}

export async function sendMessage(
    userId: string,
    message: string,
    collectionId: string,
    network: string
) {
    if (!messaging || !notifications) return;
    try {
        const doc = (await notifications.doc(userId).get()).data();
        if (doc) {
            messaging
                .send({
                    notification: {
                        title: message,
                    },
                    token: doc.token,
                    webpush: {
                        fcmOptions: {
                            link: `https://move.xyz/collection/${collectionId}?network=${network}`,
                        },
                    },
                })
                .catch((e) => {
                    log.warn("Warning from sendMessage: ", e.errorInfo);
                    log.warn("Error sending message to user: ", userId);
                });
        }
    } catch (e) {
        log.warn(e);
    }
}

export function updateProgress(collectionId: string, progress: number, remainingTime: number, pinnedCount: number, totalCount: number) {
    try {
        if (!notifications) return;
        return notifications.doc(collectionId).set({
            state: PinningStates.PENDING,
            progress,
            remainingTime,
            pinnedCount,
            totalCount
        });
    } catch (e) {
        // We're just going to ignore this error as it's not critical
        log.warn("Warning from updateProgress: ", e);
    }
}