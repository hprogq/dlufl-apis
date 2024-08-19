import readline from 'readline';
import axios, { AxiosInstance } from "axios";

export class UnifoundICSpace {
    public config: any;
    protected client: AxiosInstance;
    public userInfo: any;

    constructor(config: any, client: AxiosInstance) {
        this.config = config;
        this.client = client;
        this.initialize();
    }

    async initialize() {
        try {
            this.userInfo = await this.getUserInfo();
            console.log(`${this.getFormattedTime()}   -→   用户信息获取成功: ${this.userInfo.trueName}, ${this.userInfo.pid}`);
        } catch (error: any) {
            throw new Error(`获取用户信息失败: ${error.message}`);
        }
    }

    async getUserInfo() {
        const apiUrl = `${this.config.host}/ic-web/auth/userInfo`;
        const response = await this.client.get(apiUrl);
        if (response.data.code === 0) {
            return response.data.data;
        } else {
            throw new Error(response.data.message);
        }
    }

    static async getLoginCallbackUrl(host: string) {
        const apiUrl = `${host}/ic-web/auth/address?finalAddress=${host}&errPageUrl=${host}/#/error&manager=false&consoleType=16`;
        const response = await axios.get(apiUrl);
        const loginUrl = response.data?.data;

        if (loginUrl) {
            return this.extractServiceUrl(loginUrl);
        }
        return null;
    }

    private static async extractServiceUrl(loginUrl: string) {
        const loginResponse = await axios.get(loginUrl, {
            validateStatus: status => status >= 200 && status < 400,
            maxRedirects: 0
        });

        const location = loginResponse.headers['location'];
        if (location) {
            const parsedUrl = new URL(location);
            const searchParams = new URLSearchParams(parsedUrl.search);
            return searchParams.get('service');
        }
        return null;
    }

    getFormattedTime() {
        return new Date().toLocaleTimeString('en-GB', { hour12: false });
    }

    timeToMinutes(timeString: string) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }

    minutesToTime(minutes: number) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }

    timestampToTimeString(timestamp: number) {
        return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
    }

    findFreeTimeSlots(device: any, startMinutes: number, endMinutes: number) {
        let freeSlots = [];
        let lastEnd = startMinutes;

        device.resvInfo.sort((a: any, b: any) => a.start - b.start).forEach((slot: any) => {
            const slotStart = this.timeToMinutes(this.timestampToTimeString(slot.start));
            const slotEnd = this.timeToMinutes(this.timestampToTimeString(slot.end));

            if (slotStart > lastEnd) {
                freeSlots.push({ start: lastEnd, end: slotStart });
            }
            lastEnd = Math.max(lastEnd, slotEnd);
        });

        if (lastEnd < endMinutes) {
            freeSlots.push({ start: lastEnd, end: endMinutes });
        }

        return freeSlots;
    }

    checkFreeSlots(data: any) {
        const startMinutes = this.timeToMinutes(this.config.timeRange.start);
        const endMinutes = this.timeToMinutes(this.config.timeRange.end);
        let bestFreeSlot: any = null;
        let maxDuration = 0;

        data.forEach((device: any) => {
            this.findFreeTimeSlots(device, startMinutes, endMinutes).forEach(slot => {
                const duration = slot.end - slot.start;
                const seatNumber = parseInt(device.devName.split('-')[1]);
                const freeRate = (duration / (endMinutes - startMinutes)) * 100;

                if (duration > maxDuration && (!this.config.timeRange.freeTime.enable || freeRate >= this.config.timeRange.freeTime.min) &&
                    (!this.config?.seatNumberRange?.enable || (seatNumber >= this.config?.seatNumberRange?.min && seatNumber <= this.config?.seatNumberRange?.max))) {
                    maxDuration = duration;
                    bestFreeSlot = { device, slot };
                }
            });
        });

        if (bestFreeSlot) {
            console.log(`${this.getFormattedTime()}   -→   找到符合条件的最佳座位 ${bestFreeSlot.device.devName}，最长空闲时间段为 ${this.minutesToTime(bestFreeSlot.slot.start)} 至 ${this.minutesToTime(bestFreeSlot.slot.end)}`);
            this.handleReservation(bestFreeSlot.device, bestFreeSlot.slot);
        } else {
            console.log(`${this.getFormattedTime()}   -→   没有找到符合条件的座位，${this.config.fetchInterval}秒后再次尝试...`);
            setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
        }
    }

    handleReservation(device: any, freeSlot: any) {
        if (!this.config.seatReserve.enable) {
            console.log(`${this.getFormattedTime()}   -→   抢座功能已关闭。`);
            setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
            return;
        }

        const now = new Date();
        const start = new Date(this.config.getDate.slice(0, 4), this.config.getDate.slice(4, 6) - 1, this.config.getDate.slice(6, 8), Math.floor(freeSlot.start / 60), freeSlot.start % 60);
        const timeDifference = (start.valueOf() - now.valueOf()) / (1000 * 60);

        const startFormatted = this.minutesToTime(freeSlot.start);
        const endFormatted = this.minutesToTime(freeSlot.end);

        if ((timeDifference > this.config.seatReserve.auto.delta || this.config.seatReserve.auto.disableDelta) &&
            (!this.config.timeRange.force || (freeSlot.start <= this.timeToMinutes(this.config.timeRange.start) && freeSlot.end >= this.timeToMinutes(this.config.timeRange.end)))) {
            console.log(`${this.getFormattedTime()}   -→   正在尝试抢座...`);
            this.reserveSeat(device, freeSlot.start, freeSlot.end);
        } else {
            this.promptUserForReservation(device, freeSlot, startFormatted, endFormatted, (timeDifference > this.config.seatReserve.auto.delta || this.config.seatReserve.auto.disableDelta), (freeSlot.start <= this.timeToMinutes(this.config.timeRange.start) && freeSlot.end >= this.timeToMinutes(this.config.timeRange.end)));
        }
    }

    promptUserForReservation(device: any, freeSlot: any, startFormatted: string, endFormatted: string, diff: boolean, full: boolean) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(`${this.getFormattedTime()}   -→   座位${device.devName}在${this.config.timeRange.start}到${this.config.timeRange.end}期间${full ? "空闲" : '部分空闲，最长空闲时间段为' + startFormatted + '到' + endFormatted}。${diff ? "" : "该时间距现在已不足" + this.config.seatReserve.auto.delta + "分钟，"}是否尝试抢此时间段 (Y/n): `, (answer) => {
            if (answer.toLowerCase() === 'y' || answer === '') {
                console.log(`${this.getFormattedTime()}   -→   正在尝试抢座...`);
                this.reserveSeat(device, freeSlot.start, freeSlot.end);
            } else {
                console.log(`${this.getFormattedTime()}   -→   跳过抢座，${this.config.fetchInterval}秒后再次尝试...`);
                setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
            }
            rl.close();
        });
    }

    async reserveSeat(device: any, slotStart: any, slotEnd: any) {
        const dev_id = device.devId;
        const startDate = `${this.config.getDate.substring(0, 4)}-${this.config.getDate.substring(4, 6)}-${this.config.getDate.substring(6, 8)}`;
        const start_time = `${startDate} ${Math.floor(slotStart / 60)}:${slotStart % 60 < 10 ? '0' : ''}${slotStart % 60}:00`;
        const end_time = `${startDate} ${Math.floor(slotEnd / 60)}:${slotEnd % 60 < 10 ? '0' : ''}${slotEnd % 60}:00`;

        const requestData = {
            sysKind: 8,
            appAccNo: this.userInfo.accNo,
            memberKind: 1,
            resvMember: [this.userInfo.accNo],
            resvBeginTime: start_time,
            resvEndTime: end_time,
            testName: "",
            captcha: "",
            resvProperty: 0,
            resvDev: [dev_id],
            memo: ""
        };

        try {
            const reserveUrl = `${this.config.host}/ic-web/reserve`;
            const response = await this.client.post(reserveUrl, requestData, {
                headers: {
                    'Token': this.userInfo.token,
                    "Content-Type": "application/json",
                }
            });

            if (response.data.code === 0) {
                console.log(`${this.getFormattedTime()}   -→   成功抢到座位 ${device.devName}`);
            } else {
                console.error(`${this.getFormattedTime()}   -→   抢座 ${device.devName} 失败: ${response.data.message}`);
            }
        } catch (error: any) {
            console.error(`${this.getFormattedTime()}   -→   请求抢座 ${device.devName} 出错: ${error.message}`);
        } finally {
            this.promptContinue();
        }
    }

    promptContinue() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(`${this.getFormattedTime()}   -→   按任意键继续...`, () => {
            rl.close();
            this.searchFreeSlots();
        });
    }

    async searchFreeSlots() {
        const apiUrl = `${this.config.host}/ic-web/reserve?roomIds=${this.config.classId}&resvDates=${this.config.getDate}&sysKind=8&_=${Date.now()}`
        try {
            const response = await this.client.get(apiUrl);
            if (response.data.code === 0) {
                this.checkFreeSlots(response.data.data);
            } else {
                console.error(`${this.getFormattedTime()}   -→   API返回错误信息: ${response.data.message}`);
                setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
            }
        } catch (error: any) {
            console.error(`${this.getFormattedTime()}   -→   请求出错: ${error.message}`);
            setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
        }
    }
}
