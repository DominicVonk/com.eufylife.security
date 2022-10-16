'use strict';

const Homey = require('homey');
const path = require('path');

const { EventEmitter } = require('events');

const { EufySecurity } = require('eufy-security-client');

const { DEVICE_TYPES } = require('./constants/device_types.js');

const flowActions = require('./lib/flow/actions.js');
const flowConditions = require('./lib/flow/conditions.js');
const flowTriggers = require('./lib/flow/triggers.js');
const eufyNotificationCheckHelper = require('./lib/helpers/eufy-notification-check.helper');
const eufyEventsHelper = require('./lib/helpers/eufy-events.helper');

const { sleep } = require('./lib/utils');

const Logger = require('./lib/helpers/eufy-logger.helper');
const { Log } = require('homey-log');
const consola = require('consola').withScope('HomeyClient');

const _settingsKey = `${Homey.manifest.id}.settings`;

class App extends Homey.App {
    log() {
        consola.info.bind(this, '[log]').apply(this, arguments);
    }

    error() {
        consola.error.bind(this, '[error]').apply(this, arguments);
    }

    // -------------------- INIT ----------------------

    async onInit() {
        try {
            this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version} started...`);

            await this.initGlobarVars();

            // No await - finish onInit asap to start the drivers
            this.initApp();
        } catch (error) {
            this.homey.app.log(error);
        }
    }

    async initApp() {
        try {
            this.homeyEvents.once('driversInitialized', async () => {
                await sleep(2000);
                await this.initSettings();

                this.log('onStartup - Loaded settings', { ...this.appSettings, USERNAME: 'LOG', PASSWORD: 'LOG' });

                this.initEufyClient();
                this.sendNotifications();
            });
        } catch (error) {
            this.homey.app.log(error);
        }
    }

    // -------------------- SETTINGS ----------------------

    async initGlobarVars() {
        this.log('initGlobarVars');

        this.settingsInitialized = false;
        this.driversInitialized = false;
        this.flowsInitialized = false;

        this.deviceList = [];
        this.deviceTypes = DEVICE_TYPES;

        this.eufyRegionSwitchAllowed = false;
        this.eufyClientConnected = false;
        this.eufyClient = null;

        this.homeyLog = new Log({ homey: this.homey });

        this.homey.settings.getKeys().forEach((key) => {
            if (key == _settingsKey) {
                this.settingsInitialized = true;
            }
        });

        this.homeyEvents = new EventEmitter();
    }

    async initSettings() {
        try {
            if (this.settingsInitialized) {
                this.log('initSettings - Found settings key', _settingsKey);
                this.appSettings = this.homey.settings.get(_settingsKey);

                if ('REGION' in this.appSettings && this.appSettings['REGION'] === 'EU') {
                    this.log('initSettings - Set REGION to NL');

                    await this.updateSettings({
                        ...this.appSettings,
                        REGION: 'NL'
                    });
                }

                if (!('REGION' in this.appSettings)) {
                    await this.updateSettings({
                        ...this.appSettings,
                        REGION: 'US'
                    });
                }

                if ('HUBS' in this.appSettings) {
                    delete this.appSettings.HUBS;
                    await this.updateSettings(this.appSettings);
                }

                // Temp disable this until the new app version is live.
                // if ('CREDENTIALS' in this.appSettings) {
                //     delete this.appSettings.CREDENTIALS;
                //     await this.updateSettings(this.appSettings);
                // }

                if (!('NOTIFICATIONS' in this.appSettings)) {
                    await this.updateSettings({
                        ...this.appSettings,
                        NOTIFICATIONS: []
                    });
                }

                return true;
            }

            this.log(`Initializing ${_settingsKey} with defaults`);
            this.updateSettings({
                USERNAME: '',
                PASSWORD: '',
                REGION: 'US',
                NOTIFICATIONS: []
            });

            return true;
        } catch (err) {
            this.error(err);
        }
    }

    updateSettings(settings) {
        this.log('updateSettings - New settings:', { ...settings, USERNAME: 'LOG', PASSWORD: 'LOG' });

        this.appSettings = settings;
        this.saveSettings();
    }

    saveSettings() {
        if (typeof this.appSettings === 'undefined') {
            this.log('Not saving settings; settings empty!');
            return;
        }

        this.log('Saved settings.');
        this.homey.settings.set(_settingsKey, this.appSettings);
    }

    async sendNotifications() {
        //   const ntfy07022022 = `Good News! Eufy Security - Home-Management has been integrated in Homey! In case of issues please check: https://tinyurl.com/eufy-homey`
        //   if(!this.appSettings.NOTIFICATIONS.includes('ntfy07022022')) {
        //     ManagerNotifications.registerNotification({
        //         excerpt: ntfy07022022,
        //     });
        //     await this.updateSettings({
        //         ...this.appSettings,
        //         NOTIFICATIONS: [...this.appSettings.NOTIFICATIONS, 'ntfy07022022']
        //     });
        //   }
    }

    async initEvents() {
        if (!this.flowsInitialized) {
            this.flowsInitialized = true;

            flowActions.init(this.homey);
            flowConditions.init(this.homey);
            flowTriggers.init(this.homey);

            new eufyNotificationCheckHelper(this.homey);
            new eufyEventsHelper(this.homey);
        }
    }

    // -------------------- EUFY LOGIN ----------------------

    async eufyLogin(data) {
        try {
            this.log('eufyLogin - New settings:', { ...data, USERNAME: 'LOG', PASSWORD: 'LOG' });
            this.log(`eufyLogin - Found username and password. Logging in to Eufy`);

            const loggedIn = await this.setEufyClient(data);

            if (loggedIn) {
                this.log('eufyLogin - Succes');
            } else {
                return false;
            }

            this.updateSettings(data);

            return true;
        } catch (err) {
            this.error(err);
            return err;
        }
    }

    async checkLogin() {
        try {
            await this.eufyClient.connect();
            this.log('eufyClient connected = ' + this.eufyClient.isConnected());

            return this.eufyClient.isConnected();
        } catch (err) {
            this.log('Error authenticating Eufy : ' + err);

            return false;
        }
    }

    // ---------------------------- eufyClient ----------------------------------

    async initEufyClient() {
        if ('USERNAME' in this.appSettings && this.appSettings.USERNAME.length) {
            this.eufyRegionSwitchAllowed = true;

            await this.setEufyClient(this.appSettings);
        }
    }

    async setEufyClient(settings) {
        try {
            const debug = false;
            const config = {
                username: settings.USERNAME,
                password: settings.PASSWORD,
                country: settings.REGION,
                language: 'EN',
                persistentDir: path.resolve(__dirname, '/userdata/'),
                trustedDeviceName: 'Homey',
                acceptInvitations: true
            };

            await this.resetEufyClient();

            this.libraryLog = Logger.createNew('EufyLibrary', debug);
            this.eufyClient = await EufySecurity.initialize(config, this.libraryLog);

            this.connectEufyClientHandlers();

            return await this.checkLogin();
        } catch (err) {
            this.error(err);
        }
    }

    async resetEufyClient() {
        if (this.eufyClient) {
            this.log('resetEufyClient - Resetting EufyClient');
            await this.eufyClient.close();
            this.eufyClient = undefined;
        }
    }

    connectEufyClientHandlers() {
        // this.eufyClient.on('tfa request', () => this.onTFARequest());
        // this.eufyClient.on('captcha request', (id, captcha) => this.onCaptchaRequest(id, captcha));
        this.eufyClient.on('connect', async () => {
            this.log('Event: connected');

            this.switchRegions();
        });
    }

    async switchRegions() {
        await sleep(3000);
        const eufyDevices = await this.eufyClient.getDevices();

        this.log('switchRegions', { region: this.appSettings.REGION, eufyRegionSwitchAllowed: this.eufyRegionSwitchAllowed, deviceList: this.deviceList.length, eufyDevices: eufyDevices.length });

        if (this.eufyRegionSwitchAllowed && this.deviceList.length && !eufyDevices.length) {
            const REGION = this.appSettings.REGION === 'US' ? 'NL' : 'US';

            this.eufyRegionSwitchAllowed = false;

            this.log('switchRegions restart eufyClient with region: ', REGION);

            await this.updateSettings({
                ...this.appSettings,
                REGION: REGION
            });

            await sleep(200);

            this.setEufyClient(this.appSettings);
        } else {
            this.eufyRegionSwitchAllowed = false;
            this.eufyClientConnected = true;

            this.homeyEvents.emit('eufyClientConnected');

            this.initEvents();
        }
    }

    async setDevice(device) {
        this.deviceList = [...this.deviceList, device];
    }

    async setDevices(devices) {
        this.deviceList = [...this.deviceList, ...devices];

        if (!this.driversInitialized) {
            this.driversInitialized = true;
            await sleep(2000);
            this.homeyEvents.emit('driversInitialized');
        }
    }

    async removeDevice(device_sn) {
        try {
            this.homey.app.log('removeDevice', device_sn);

            const filteredList = this.deviceList.filter((dl) => {
                const data = dl.getData();
                return data.device_sn !== device_sn;
            });

            this.deviceList = filteredList;
        } catch (error) {
            this.error(error);
        }
    }

    /// ----------------- Streaming --------------------
    async getStreamAddress() {
        try {
            let internalIp = (await this.homey.cloud.getLocalAddress()).replace(/:.*/, '');
            internalIp = internalIp.replace(/\./g, '-');
            this.log(`getStreamAddress - Set internalIp`, internalIp);

            return `https://${internalIp}.homey.homeylocal.com`;
        } catch (error) {
            this.error(error);
        }
    }

    async getStreamUrl(device_sn) {
        try {
            const pairedDevices = this.homey.app.deviceList;
            const device = pairedDevices.find((d) => {
                const data = d.getData();
                this.log(`getStreamUrl - device_sn`, device_sn);
                this.log(`getStreamUrl - data`, data);

                return data.device_sn === device_sn;
            });

            const settings = device.getSettings();
            this.log(`getStreamUrl - settings`, settings);
            return settings.CLOUD_STREAM_URL ? settings.CLOUD_STREAM_URL : null;
        } catch (error) {
            this.error(error);
        }
    }
}

module.exports = App;
