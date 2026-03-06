"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentIntents = void 0;
exports.paymentIntents = {};
// MILITARY-GRADE SCALE OPTIMIZATION: Garbage Collector
// Automatically cleans up old intents every 60 minutes to prevent memory leaks in 30k/day traffic
setInterval(() => {
    const now = new Date();
    const oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);
    let count = 0;
    for (const id in exports.paymentIntents) {
        const createdAt = new Date(exports.paymentIntents[id].createdAt).getTime();
        if (createdAt < oneDayAgo) {
            delete exports.paymentIntents[id];
            count++;
        }
    }
    if (count > 0) {
        console.log(`[GC] Cleaned up ${count} expired payment intents. Memory optimized for high-volume 24h cycle.`);
    }
}, 3600000); // Every hour
