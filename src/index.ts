import dotenv from "dotenv";
import { DluflCas } from "./cas";
import { UnifoundICSpace } from "./lib";
import { NeusoftDcp } from "./dcp";
dotenv.config();

const config = {
    studentId: process.env.STUDENT_ID ?? "",
    pwd: process.env.PASSWORD ?? "",
    dcp: {
        host: "https://i.dlufl.edu.cn",
        auth: "https://i.dlufl.edu.cn/dcp/",
    },
    lib: {
        host: "https://icspace.dlufl.edu.cn",
        getDate: "20240807",
        classId: "100475787",
        startTime: "17:30",
        endTime: "22:00",
        seatNumberRangeEnable: true,
        seatNumberRangeMin: 1,
        seatNumberRangeMax: 100,
        freeTimeRequest: 80,
        fetchInterval: 3,
        autoReserveDelta: 40, // 自动抢座的时间差，单位为分钟
        forceReserve: false, // 将此值设置为true以强制抢座
        partForceReserve: true, // 将此值设置为true以部分强制抢座
        enableReserve: true, // 设置为false关闭抢座功能
    },
};

/*
 * Unifound IC Space Configuration
 */
// DluflCas.libGetLoginUrl().then((serviceUrl) => {
//     if (!serviceUrl) {
//         throw new Error("错误: 服务初始化失败。");
//     } else {
//         DluflCas.login(config.studentId, config.pwd, config.lib.host, serviceUrl, ["JSESSIONID", "ic-cookie"]).then(
//             ({session}) => {
//                 const cas = new DluflCas(session, config.lib.host);
//                 const icSpace = new UnifoundICSpace(config.lib, cas.client);
//                 icSpace.searchFreeSlots();
//             }
//         );
//     }
// });

/*
 * Neusoft Dcp Portal Configuration
 */
DluflCas.login(config.studentId, config.pwd, config.dcp.host, config.dcp.auth, ["dcp114"]).then(
    ({session}) => {
        const cas = new DluflCas(session, config.dcp.host);
        const dcp = new NeusoftDcp(config.dcp, cas.client);
        dcp.initialize().then(() => {
            dcp.inquireClassSchedule();
        }).catch((error: any) => {
            console.error("错误: 用户信息获取失败: ", error);
        });
    }
);