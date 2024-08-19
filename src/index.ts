import dotenv from "dotenv";
import inquirer from "inquirer";
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
        getDate: "20240820",
        classId: "100475787",
        timeRange: {
            enable: true,
            start: "08:30",
            end: "22:00",
            force: false,
            freeTime: {
                enable: true,
                min: 80,
            },
        },
        fetchInterval: 3,
        seatReserve: {
            enable: true,
            auto: {
                delta: 40,
                disableDelta: false,
            },
            seatNumberRange: {
                enable: true,
                min: 1,
                max: 100,
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
async function showMenu() {
    const questions: any[] = [
        {
            type: 'list',
            name: 'functionChoice',
            message: '请选择要执行的功能：',
            choices: functions.map((func, index) => ({
                name: func.name,
                value: index
            }))
        }
    ];

    const answers = await inquirer.prompt(questions);
    functions[answers.functionChoice].fn();
}

// 初始化用户信息输入
async function initialize() {
    const questions: any[] = [
        {
            type: 'input',
            name: 'studentId',
            message: '请输入学号:',
            when: () => !config.studentId
        },
        {
            type: 'password',
            name: 'password',
            message: '请输入密码:',
            mask: '*',
            when: () => !config.pwd
        }
    ];

    const answers = await inquirer.prompt(questions);

    config.studentId = config.studentId || answers.studentId;
    config.pwd = config.pwd || answers.password;

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