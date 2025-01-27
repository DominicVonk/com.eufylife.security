exports.until = async function (predFn) {
    const poll = (done) => (predFn() ? done() : setTimeout(() => poll(done), 500));
    return new Promise(poll);
};

// get
exports.get = function (obj, dirtyPath, defaultValue) {
    if (obj === undefined || obj === null) return defaultValue;
    const path = typeof dirtyPath === 'string' ? dirtyPath.split('.') : dirtyPath;
    let objLink = obj;
    if (Array.isArray(path) && path.length) {
        for (let i = 0; i < path.length - 1; i++) {
            const currentVal = objLink[path[i]];
            if (currentVal !== undefined && currentVal !== null) {
                objLink = currentVal;
            } else {
                return defaultValue;
            }
        }
        const value = objLink[path[path.length - 1]];
        return value === undefined || value === null ? defaultValue : value;
    }
    return defaultValue;
};

exports.keyByValue = function (obj, value) {
    return Object.keys(obj).find((key) => obj[key] === value);
};

exports.keyByValueIncludes = function (obj, value) {
    return Object.keys(obj).find((key) => value.includes(obj[key]));
};

exports.sleep = async function (ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

exports.randomNumber = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}