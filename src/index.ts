import dotenv from "dotenv";
import readline from "readline";
import { DluflCas } from "./cas";
import { UnifoundICSpace } from "./icspace";
import { NeusoftDcp } from "./dcp";

dotenv.config();

const config = {
    studentId: process.env.STUDENT_ID ?? "",
    pwd: process.env.PASSWORD ?? "",
    dcp: {
        host: "https://i.dlufl.edu.cn",
        auth: "https://i.dlufl.edu.cn/dcp/",
    },
    icspace: {
        host: "https://icspace.dlufl.edu.cn",
        areaList: [
            { id: "100475785", name: "二楼东区" },
            { id: "100475787", name: "二楼中区" },
            { id: "100475789", name: "二楼西区" },
            { id: "109342010", name: "六楼电子阅览室" },
        ],
        getDate: "20240820", // 预定座位的日期
        classId: "100475787", // 预定座位的区域ID，请从上方areaList中选择一个区域，并填入其编号（字符串）
        timeRange: {
            enable: true, // 如果你就是想找个座位坐下，可以关掉它。
            start: "08:30", // 预定座位的期望开始时间
            end: "22:00", // 预定座位的期望结束时间
            force: false, // 是否严格要求座位空闲时间范围，关闭后将根据下方空闲时间要求筛选，并择优选择
            freeTime: {
                enable: true, // 是否开启空闲时间要求
                min: 80, // 空闲时间的最低要求（百分比）
            },
        },
        // 座位号范围配置（如座位代码为2F-123，则其座位号为123）
        fetchInterval: 3, // 获取最新座位的请求间隔
        seatReserve: {
            enable: true, // 是否开启预订座位功能。
            auto: {
                delta: 40, // 所选座位距现在不足该时间（分钟）将要求确认，避免预定后直接生效导致取消不了的尴尬情况。
                disableDelta: false, // 如果你已经在图书馆了，可以打开此选项。此选项将不会因此向您确认是否确认抢座。
            },
            seatNumberRange: {
                enable: true, // 是否开启座位号范围限制
                min: 1, // 座位号范围最小值
                max: 100, // 座位号范围最大值
            },
        },
    },
};

// 功能列表
const functions = [
    { name: "图书馆预约座位 (杭州联创ICSpace)", fn: initializeUnifoundICSpace },
    { name: "数字大外课程表查询 (东软DCP)", fn: initializeNeusoftDcp }
];

// 功能选择菜单
function showMenu() {
    console.log("\n请选择要执行的功能：");
    functions.forEach((func, index) => {
        console.log(`${index + 1}. ${func.name}`);
    });
    promptUser();
}

function promptUser() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question("\n输入功能编号并按回车键: ", (answer) => {
        const choice = parseInt(answer);
        if (!isNaN(choice) && choice > 0 && choice <= functions.length) {
            rl.close();
            functions[choice - 1].fn();
        } else {
            console.log("无效的选择，请重试。");
            rl.close();
            showMenu();
        }
    });
}

function getUserInput(promptText: string, isPassword: boolean = false): Promise<string> {
    const options = {
        input: process.stdin,
        output: process.stdout,
        terminal: true
    };

    const rl = readline.createInterface(options);

    return new Promise<string>((resolve) => {
        rl.question(promptText, (input) => {
            rl.close();
            resolve(input);
        });

        if (isPassword) {
            options.output.write = function (str: string) {
                if (!str.includes('\n')) return options.output.write('');
                return options.output.write('\n');
            };
        }
    });
}

async function initialize() {
    if (!config.studentId) {
        config.studentId = await getUserInput("请输入学号: ");
    }

    if (!config.pwd) {
        config.pwd = await getUserInput("请输入密码: ", true);
    }

    showMenu();
}

// Unifound IC Space
function initializeUnifoundICSpace() {
    UnifoundICSpace.getLoginCallbackUrl(config.icspace.host).then((serviceUrl) => {
        if (!serviceUrl) {
            throw new Error("错误: 服务初始化失败。");
        } else {
            DluflCas.login(config.studentId, config.pwd, config.icspace.host, serviceUrl, ["JSESSIONID", "ic-cookie"]).then(
                ({ session }) => {
                    const cas = new DluflCas(session, config.icspace.host);
                    const icSpace = new UnifoundICSpace(config.icspace, cas.client);
                    icSpace.searchFreeSlots();
                }
            ).catch((error) => {
                console.error("错误: 登录失败: ", error);
            });
        }
    }).catch((error) => {
        console.error("错误: 获取服务URL失败: ", error);
    });
}

// Neusoft DCP
function initializeNeusoftDcp() {
    DluflCas.login(config.studentId, config.pwd, config.dcp.host, config.dcp.auth, ["dcp114"]).then(
        ({ session }) => {
            const cas = new DluflCas(session, config.dcp.host);
            const dcp = new NeusoftDcp(config.dcp, cas.client);
            dcp.initialize().then(() => {
                dcp.inquireClassSchedule();
            }).catch((error: any) => {
                console.error("错误: 用户信息获取失败: ", error);
            });
        }
    ).catch((error) => {
        console.error("错误: 登录失败: ", error);
    });
}

// 运行程序前获取必要信息
initialize();