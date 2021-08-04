const mainDriver = require('../main-driver');
const { DEVICE_TYPES } = require('../../../constants/device_types');

module.exports = class driver_INDOOR_CAM_PAN_TILT extends mainDriver {
    deviceType() {
        return DEVICE_TYPES.INDOOR_CAM_PAN_TILT
    }
}