// messenger.mjs
import { storage } from './storage.mjs';
import {logger} from './logger.js'
export function broadcastToAllActiveConnections(message, data) {
    if (storage['activeConnections']) {
        // if (message !== 'status') {
        //     console.log(`Broadcasting ${message} to all active connections`);
        // }
        const activeConnections = storage['activeConnections'];
        let i = 0
        activeConnections.forEach((connection) => {
            try {
                connection.emit(message, data);
            } catch (err) {
                console.error(`${err} error in broadcasting to connection`);
            } 
            i+=1
        });
    } else {
        console.error('No active connections found');
    }
}