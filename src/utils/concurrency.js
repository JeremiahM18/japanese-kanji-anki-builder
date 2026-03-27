async function mapWithConcurrency(items, concurrency, mapper) {
    const list = Array.isArray(items) ? items : [];
    const results = new Array(list.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const currentIndex = nextIndex++;

            if (currentIndex >= list.length) {
                return;
            }

            results[currentIndex] = await mapper(list[currentIndex], currentIndex);
        }
    }

    const safeConcurrency = Math.max(1, Number(concurrency) || 1);
    const workerCount = Math.min(safeConcurrency, Math.max(1, list.length));

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
}

module.exports = {
    mapWithConcurrency,
};
