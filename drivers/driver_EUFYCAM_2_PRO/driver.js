const mainDriver = require('../main-driver');


module.exports = class driver_EUFYCAM_2_PRO extends mainDriver {
    deviceType() {
        return this.homey.app.deviceTypes.EUFYCAM_2_PRO
    }
}