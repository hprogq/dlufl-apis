import { AxiosInstance } from "axios";
import { strEnc } from "./des";
import readline from 'readline';
import { stdout } from 'process';
import Table from 'cli-table3';

type UserType = {
    ID_NUMBER: string;
    IS_MAIN: string;
    ID_TYPE: string;
    CODENAME: string;
};

export class NeusoftDcp {
    public config: any;
    public userInfo: any;
    protected client: AxiosInstance;

    constructor(config: any, client: AxiosInstance) {
        this.config = config;
        this.client = client;
    }

    async initialize() {
        const userInfo = await this.getUserInfo();
        this.userInfo = userInfo;
        console.log('登录用户: ', userInfo.USER_NAME, userInfo.USER_SEX, userInfo.ID_TYPE, userInfo.UNIT_NAME, userInfo.ID_NUMBER);
    }

    async getUserInfo() {
        try {
            const userType: UserType = await this.getUserType();
            const apiUrl = `${this.config.host}/dcp/sys/uacm/profile/getUserById`;
            const response = await this.client.post(apiUrl, {
                BE_OPT_ID: strEnc(userType.ID_NUMBER, 'tp', 'des', 'param'),
            }, {
                headers: {
                    "Content-Type": "application/json;charset=UTF-8",
                }
            });

            if (response.data.USER_NAME) {
                return response.data;
            } else {
                console.error("错误: 获取用户类型失败。");
            }
        } catch (error: any) {
            throw new Error("错误: 获取用户信息失败: " + error.message);
        }
    }

    async getUserType() {
        try {
            const apiUrl = `${this.config.host}/dcp/sys/uacm/profile/getUserType`;
            const response = await this.client.post(apiUrl, {}, {
                headers: {
                    "Content-Type": "application/json;charset=UTF-8",
                }
            });

            if (Array.isArray(response.data) && response.data.some((item: any) => typeof item === 'object' && item !== null)) {
                return response.data[0];
            } else {
                console.error("错误: 获取用户类型失败。");
            }
        } catch (error: any) {
            throw new Error("错误: 获取用户信息失败: " + error.message);
        }
    }

    async getClassSchedule(schoolYear: string, semester: string, learnWeek: number) {
        try {
            const apiUrl = `${this.config.host}/dcp/apps/classScheduleApp/getClassbyUserInfo`;
            const response = await this.client.post(apiUrl, {
                schoolYear,
                semester,
                learnWeek,
            }, {
                headers: {
                    "Content-Type": "application/json;charset=UTF-8",
                }
            });

            if (Array.isArray(response.data)) {
                return response.data;
            } else {
                console.error("错误: 获取课程表失败。");
            }
        } catch (error: any) {
            throw new Error("错误: 获取课程表失败: " + error.message);
        }
    }

    isWeekInRange(week: number, skzc: string): boolean {
        const ranges = skzc.split(',').map(range => range.split('-').map(Number));
        return ranges.some(([start, end]) => week >= start && week <= (end || start));
    }

    formatClassSchedule(schedule: any[], title: string = "课程表", asTable: boolean = true, learnWeek: number) {
        const weekDays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        const timeSlots: { [key: string]: string } = {
            "1": "1-2节",
            "3": "3-4节",
            "5": "5-6节",
            "7": "7-8节",
            "9": "9-10节",
            "11": "11-12节"
        };
        const formattedSchedule: { [key: string]: { [key: string]: any[] } } = {};

        weekDays.forEach(day => {
            formattedSchedule[day] = {};
            Object.values(timeSlots).forEach(slot => {
                formattedSchedule[day][slot] = [];
            });
        });

        schedule.forEach((item: any) => {
            const skxq = item.SKXQ;
            const dayIndex = parseInt(skxq) - 1;

            if (isNaN(dayIndex) || dayIndex < 0 || dayIndex >= weekDays.length) {
                return;
            }

            const dayName = weekDays[dayIndex];
            const rawSlotKey = item.SKJC;
            const timeSlotKey = parseInt(rawSlotKey, 10).toString();
            const slotName = timeSlots[timeSlotKey];

            if (this.isWeekInRange(learnWeek, item.SKZC)) {
                if (slotName && formattedSchedule[dayName] && formattedSchedule[dayName][slotName]) {
                    formattedSchedule[dayName][slotName].push({
                        course: item.KCMC,
                        location: item.JXDD,
                        teacher: item.JSXM
                    });
                }
            }
        });

        console.log(title);
        console.log("------------------------------------------------------------------------------------------------------------------------------------------------------------------");

        if (asTable) {
            const table = new Table({
                head: ['时间段', ...weekDays],
                colWidths: [10, 20, 20, 20, 20, 20, 20, 20]
            });

            Object.keys(timeSlots).forEach(timeSlotKey => {
                const slot = timeSlots[timeSlotKey];
                const row = [slot];

                weekDays.forEach(day => {
                    const classes = formattedSchedule[day][slot];
                    if (classes.length > 0) {
                        row.push(classes.map(cls => `${cls.course}\n${cls.location}\n${cls.teacher}`).join("\n"));
                    } else {
                        row.push('');
                    }
                });

                table.push(row);
            });

            console.log(table.toString());
        } else {
            weekDays.forEach(day => {
                console.log(day + ":");
                Object.values(timeSlots).forEach(slot => {
                    if (formattedSchedule[day][slot].length > 0) {
                        console.log(`  ${slot}:`);
                        formattedSchedule[day][slot].forEach((cls: any) => {
                            console.log(`    ${cls.course} (${cls.location}) - ${cls.teacher}`);
                        });
                    }
                });
            });
        }
    }

    async inquireClassSchedule() {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true
        });

        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        let schoolYear = `${currentMonth >= 9 ? currentYear : currentYear - 1}-${currentMonth >= 9 ? currentYear + 1 : currentYear}`;
        let semester = currentMonth >= 9 || currentMonth <= 3 ? "1" : "2";
        let learnWeek = 1;

        const showPrompt = () => {
            console.log("\n[应用: 查看课程表]\n使用上箭头和下箭头进行选择，按回车键确认。");
        };

        const promptUser = (label: string, value: string) => {
            stdout.clearLine(0);
            stdout.cursorTo(0);
            stdout.write(`${label}: ${value}`);
        };

        const selectSchoolYear = () => {
            return new Promise<void>((resolve) => {
                promptUser("学年", schoolYear);

                process.stdin.on('keypress', (char, key) => {
                    if (key.name === 'up') {
                        const years = schoolYear.split('-').map(Number);
                        schoolYear = `${years[0] + 1}-${years[1] + 1}`;
                        promptUser("学年", schoolYear);
                    } else if (key.name === 'down') {
                        const years = schoolYear.split('-').map(Number);
                        schoolYear = `${years[0] - 1}-${years[1] - 1}`;
                        promptUser("学年", schoolYear);
                    } else if (key.name === 'return') {
                        process.stdin.removeAllListeners('keypress');
                        resolve();
                    }
                });
            });
        };

        const selectSemester = () => {
            return new Promise<void>((resolve) => {
                promptUser("学期", semester);

                process.stdin.on('keypress', (char, key) => {
                    if (key.name === 'up' || key.name === 'down') {
                        semester = semester === "1" ? "2" : "1";
                        promptUser("学期", semester);
                    } else if (key.name === 'return') {
                        process.stdin.removeAllListeners('keypress');
                        stdout.write('\n');
                        resolve();
                    }
                });
            });
        };

        const selectLearnWeek = () => {
            return new Promise<void>((resolve) => {
                promptUser("教学周", `第${learnWeek}周`);

                process.stdin.on('keypress', (char, key) => {
                    if (key.name === 'up' && learnWeek < 20) {
                        learnWeek++;
                        promptUser("教学周", `第${learnWeek}周`);
                    } else if (key.name === 'down' && learnWeek > 1) {
                        learnWeek--;
                        promptUser("教学周", `第${learnWeek}周`);
                    } else if (key.name === 'return') {
                        process.stdin.removeAllListeners('keypress');
                        stdout.write('\n');
                        resolve();
                    }
                });
            });
        };

        if (process.stdin.setRawMode) process.stdin.setRawMode(true);
        process.stdin.resume();

        showPrompt();
        await selectSchoolYear();
        await selectSemester();
        await selectLearnWeek();

        rl.close();

        const schedule = await this.getClassSchedule(schoolYear, semester, learnWeek);
        this.formatClassSchedule(schedule, `\n${schoolYear} 学年第${semester}学期 校历第${learnWeek}周 课程表`, true, learnWeek);
    }
}
