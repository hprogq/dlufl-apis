import readline from 'readline';
import { AxiosInstance } from "axios";

export class UnifoundICSpace {
    public config: any;
    protected client: AxiosInstance;
    public userInfo: any;

    constructor(config: any, client: AxiosInstance) {
        this.config = config;
        this.client = client;
        this.getUserInfo().then(userInfo => {
            this.userInfo = userInfo;
            console.log(this.getFormattedTime() + '   -→   用户信息获取成功: ', userInfo.trueName, userInfo.pid);
        }).catch(error => {
            throw new Error("获取用户信息失败: " + error.message);
        });
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

    getFormattedTime() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        return `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
    }

    timeToMinutes(timeString: string) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 60 + minutes;
    }

    timeToInteger(timeString: string) {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours * 100 + minutes;
    }

    minutesToTime(minutes: number) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours < 10 ? '0' : ''}${hours}:${mins < 10 ? '0' : ''}${mins}`;
    }

    timestampToTimeString(timestamp: number) {
        const date = new Date(timestamp);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        return `${hours < 10 ? '0' + hours : hours}:${minutes < 10 ? '0' + minutes : minutes}`;
    }

    findFreeTimeSlots(device: any, startMinutes: any, endMinutes: any) {
        let freeSlots = [];
        let lastEnd = startMinutes;

        device.resvInfo.sort((a: any, b: any) => a.start - b.start).forEach((slot: any) => {
            const slotStart = this.timeToMinutes(this.timestampToTimeString(slot.start));
            const slotEnd = this.timeToMinutes(this.timestampToTimeString(slot.end));

            if (slotStart > lastEnd) { // Found a free slot
                freeSlots.push({ start: lastEnd, end: slotStart });
            }
            lastEnd = Math.max(lastEnd, slotEnd);
        });

        if (lastEnd < endMinutes) { // Free time at the end
            freeSlots.push({ start: lastEnd, end: endMinutes });
        }

        return freeSlots;
    }

    checkFreeSlots(data: any) {
        const startMinutes = this.timeToMinutes(this.config.startTime);
        const endMinutes = this.timeToMinutes(this.config.endTime);
        let bestFreeSlot: any = null;
        let maxDuration = 0;

        data.forEach((device: any) => {
            const freeSlots = this.findFreeTimeSlots(device, startMinutes, endMinutes);
            freeSlots.forEach(slot => {
                const duration = slot.end - slot.start;
                const seatNumber = parseInt(device.devName.split('-')[1]);
                const totalMinutes = endMinutes - startMinutes;
                const freeRate = (duration / totalMinutes) * 100;

                if (duration > maxDuration && freeRate >= this.config.freeTimeRequest &&
                    (!this.config.seatNumberRangeEnable || (seatNumber >= this.config.seatNumberRangeMin && seatNumber <= this.config.seatNumberRangeMax))) {
                    maxDuration = duration;
                    bestFreeSlot = { device, slot };
                }
            });
        });

        if (bestFreeSlot) {
            console.log(this.getFormattedTime() + '   -→   ' + `找到符合条件的最佳座位 ${bestFreeSlot.device.devName}，最长空闲时间段为 ${this.minutesToTime(bestFreeSlot.slot.start)} 至 ${this.minutesToTime(bestFreeSlot.slot.end)}`);
            this.handleReservation(bestFreeSlot.device, bestFreeSlot.slot);
        } else {
            console.log(this.getFormattedTime() + '   -→   ' + '没有找到符合条件的座位，' + this.config.fetchInterval + '秒后再次尝试...');
            setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
        }
    }

    handleReservation(device: any, freeSlot: any) {
        if (!this.config.enableReserve) {
            console.log(this.getFormattedTime() + '   -→   ' + '抢座功能已关闭。');
            setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
            return;
        }

        const now = new Date();
        const year = this.config.getDate.slice(0, 4);
        const month = this.config.getDate.slice(4, 6);
        const day = this.config.getDate.slice(6, 8);
        const start = new Date(year, month - 1, day, Math.floor(freeSlot.start / 60), freeSlot.start % 60);
        const timeDifference = (start.valueOf() - now.valueOf()) / (1000 * 60); // 时间差以分钟计算

        const startFormatted = this.minutesToTime(freeSlot.start);
        const endFormatted = this.minutesToTime(freeSlot.end);

        if ((timeDifference > this.config.autoReserveDelta || this.config.forceReserve) && (this.config.partForceReserve || (freeSlot.start <= this.timeToMinutes(this.config.startTime) && freeSlot.end >= this.timeToMinutes(this.config.endTime)))) {
            console.log(this.getFormattedTime() + '   -→   ' + '正在尝试抢座...');
            this.reserveSeat(device, freeSlot.start, freeSlot.end);
        } else {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question(`${this.getFormattedTime()}   -→   座位${device.devName}在${this.config.startTime}到${this.config.endTime}期间部分空闲，最长空闲时间段为${startFormatted}到${endFormatted}。是否尝试抢此时间段 (Y/n): `, (answer) => {
                if (answer.toLowerCase() === 'y' || answer === '') {
                    console.log(this.getFormattedTime() + '   -→   ' + '正在尝试抢座...');
                    this.reserveSeat(device, freeSlot.start, freeSlot.end);
                } else {
                    console.log(this.getFormattedTime() + '   -→   ' + '跳过抢座，' + this.config.fetchInterval + '秒后再次尝试...');
                    setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
                }
                rl.close();
            });
        }
    }

    reserveSeat(device: any, slotStart: any, slotEnd: any) {
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

        const reserveUrl = `${this.config.host}/ic-web/reserve`;

        this.client.post(reserveUrl, requestData, {
            headers: {
                'Token': this.userInfo.token,
                "Content-Type": "application/json",
            }
        })
            .then(response => {
                if (response.data.code === 0) {
                    console.log(this.getFormattedTime() + '   -→   ' + '成功抢到座位 ' + device.devName);
                } else {
                    console.error(this.getFormattedTime() + '   -→   ' + '抢座 ' + device.devName + ' 失败: ', response.data.message);
                }
                this.promptContinue();
            })
            .catch(error => {
                console.error(this.getFormattedTime() + '   -→   ' + '请求抢座 ' + device.devName + ' 出错: ', error);
                this.promptContinue();
            });
    }

    promptContinue() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(this.getFormattedTime() + '   -→   按任意键继续...', () => {
            rl.close();
            this.searchFreeSlots();
        });
    }

    searchFreeSlots() {
        const apiUrl = `${this.config.host}/ic-web/reserve?roomIds=${this.config.classId}&resvDates=${this.config.getDate}&sysKind=8&_=${new Date().getTime()}`
        this.client.get(apiUrl)
            .then(response => {
                if (response.data.code === 0) {
                    this.checkFreeSlots(response.data.data);
                } else {
                    console.error(this.getFormattedTime() + '   -→   API返回错误信息: ', response.data.message);
                    setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
                }
            })
            .catch(error => {
                console.error(this.getFormattedTime() + '   -→   请求出错: ', error);
                setTimeout(() => this.searchFreeSlots(), this.config.fetchInterval * 1000);
            });
    }
}
