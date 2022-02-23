const mainDriver = require('../main-driver');
const { DEVICE_TYPES } = require('../../../constants/device_types');

module.exports = class driver_VIDEO_DOORBELL_DUAL_BATTERY extends mainDriver {
    deviceType() {
        return DEVICE_TYPES.VIDEO_DOORBELL_DUAL_BATTERY
    }
}