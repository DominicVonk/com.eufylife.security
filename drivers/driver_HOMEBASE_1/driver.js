const mainHubDriver = require('../main-hub-driver');
const { DEVICE_TYPES } = require('../../../constants/device_types');

module.exports = class driver_HOMEBASE_1 extends mainHubDriver {
    deviceType() {
        return DEVICE_TYPES.HOMEBASE_1
    }
}