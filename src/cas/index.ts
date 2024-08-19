import axios, { AxiosInstance } from "axios";
import { Cookie, CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import { strEnc } from "./des";

export class DluflCas {
    jar: CookieJar = new CookieJar();
    client: AxiosInstance;
    static headers = {
        "User-Agent": `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 ${new Date().getTime()}`,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Content-Type": "application/x-www-form-urlencoded",
        "Pragma": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "sec-ch-ua": "\"Not/A)Brand\";v=\"8\", \"Chromium\";v=\"126\", \"Google Chrome\";v=\"126\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"macOS\"",
        'X-Forwarded-For': Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.')
    };

    constructor(public session: any, serviceUrl: string) {
        this.initializeCookies(session, serviceUrl);
        this.client = wrapper(
            axios.create({
                jar: this.jar,
                headers: DluflCas.headers,
            })
        );
    }

    private initializeCookies(session: any, serviceUrl: string) {
        Object.keys(session).forEach((key) => {
            const value = session[key];
            if (value) {
                this.jar.setCookieSync(
                    new Cookie({ key, value }),
                    serviceUrl
                );
            }
        });
    }

    static async login(studentId: string, password: string, serviceUrl: string, casValidateUrl: string, cookieKeys: string[]) {
        studentId = studentId.trim();
        password = password.trim();
        const casHost = "https://cas.dlufl.edu.cn";

        const jar = new CookieJar();
        const client = wrapper(axios.create({ jar, headers: this.headers }));

        try {
            const initResponse = await client.get(`${casHost}/cas/login?service=${casValidateUrl}&renew=true&_=${new Date().getTime()}`);
            const { ticket, execution } = this.extractLoginFormParams(initResponse.data);
            const rsa = strEnc(`${studentId}${password}${ticket}`, "1", "2", "3");

            await client.post(`${casHost}/cas/login?service=${casValidateUrl}`, {
                rsa, ul: studentId.length, pl: password.length, lt: ticket, execution, _eventId: "submit",
            });

            return this.extractSessionCookies(jar, serviceUrl, cookieKeys);
        } catch (error) {
            this.handleError(error);
            throw new Error("登录失败");
        }
    }

    private static extractLoginFormParams(html: string) {
        const $ = cheerio.load(html);
        return {
            ticket: $("#lt").val(),
            execution: $('input[name="execution"]').val(),
        };
    }

    private static async extractSessionCookies(jar: CookieJar, serviceUrl: string, cookieKeys: string[]) {
        const cookies = await jar.getCookies(serviceUrl);
        const session = cookieKeys.reduce((acc, key) => {
            acc[key] = cookies.find((cookie) => cookie.key === key)?.value;
            return acc;
        }, {} as { [key: string]: string | undefined });

        const missingKeys = cookieKeys.filter(key => !session[key]);
        if (missingKeys.length > 0) {
            console.error(`错误: 未获取到有效鉴权令牌，可能是由于用户账号或密码有误，请检查。`);
            process.exit(1);
        }
        return { session };
    }

    private static handleError(error: any) {
        if (error.response) {
            console.error("Response error:", {
                data: error.response.data,
                status: error.response.status,
                headers: error.response.headers,
            });
        } else if (error.request) {
            console.error("Request error:", error.request);
        } else {
            console.error("Error message:", error.message);
        }
        console.error("Config:", error.config);
    }
}