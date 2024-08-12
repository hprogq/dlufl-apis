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
        // "Host": "cas.dlufl.edu.cn",
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
        Object.keys(session).forEach((key) => {
            const value = session[key];
            if (value) {
                this.jar.setCookieSync(
                    new Cookie({
                        key: key,
                        value: value,
                    }),
                    serviceUrl
                );
            }
        });

        this.client = wrapper(
            axios.create({
                jar: this.jar,
                headers: DluflCas.headers,
            })
        );
    }

    static async libGetLoginUrl() {
        const api = 'https://icspace.dlufl.edu.cn/ic-web/auth/address?finalAddress=https:%2F%2Ficspace.dlufl.edu.cn&errPageUrl=https:%2F%2Ficspace.dlufl.edu.cn%2F%23%2Ferror&manager=false&consoleType=16';
        const response = await axios.get(api);
        const data = response.data;
        const loginUrl = data.data;

        const loginResponse = await axios.get(loginUrl, {
            validateStatus: status => status >= 200 && status < 400,
            maxRedirects: 0
        });

        const location = loginResponse.headers['location'];

        if (location) {
            const parsedUrl = new URL(location);
            const searchParams = new URLSearchParams(parsedUrl.search);
            const service = searchParams.get('service');
            return service;
        } else {
            return null;
        }
    }

    static async login(studentId: string, password: string, serviceUrl: string, casValidateUrl: string, cookieKeys: string[]) {
        studentId = studentId.trim();
        password = password.trim();
        const casHost = "https://cas.dlufl.edu.cn";

        const jar = new CookieJar();
        const client = wrapper(
            axios.create({
                jar,
                headers: this.headers,
            })
        );

        const initResponse = await client.get(`${casHost}/cas/login?service=${casValidateUrl}&renew=true&_=${new Date().getTime()}`);
        const gif = await client.get(`${casHost}/cas/comm/images/camera-loader.gif`);

        const $ = cheerio.load(initResponse.data);
        const ticket = $("#lt").val();
        const execution = $('input[name="execution"]').val();

        const rsa = strEnc(studentId + password + ticket, "1", "2", "3");

        try {
            const response = await client.post(
                `${casHost}/cas/login?service=${casValidateUrl}`,
                {
                    rsa: rsa,
                    ul: studentId.length,
                    pl: password.length,
                    lt: ticket,
                    execution: execution,
                    _eventId: "submit",
                }
            );
        } catch (error: any) {
            if (error.response) {
                console.error("Response data:", error.response.data);
                console.error("Response status:", error.response.status);
                console.error("Response headers:", error.response.headers);
            } else if (error.request) {
                console.error("Request data:", error.request);
            } else {
                console.error("Error message:", error.message);
            }
            console.error("Config:", error.config);
        }


        const cookies = await jar.getCookies(serviceUrl);

        const session = cookieKeys.reduce((acc, key) => {
            acc[key] = cookies.find((cookie) => cookie.key === key)?.value;
            return acc;
        }, {} as { [key: string]: string | undefined });

        const missingKeys = cookieKeys.filter(key => !session[key]);
        if (missingKeys.length > 0) {
            throw new Error(`错误: 未获取到有效鉴权令牌，缺少: ${missingKeys.join(", ")}。`);
        }

        return { session };
    }
}
