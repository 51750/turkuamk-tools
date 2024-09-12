import dayjs from "dayjs";
import fetchCookie from "fetch-cookie";
import ical from "ical-generator";
import moment from "moment-timezone";
import nodefetch from "node-fetch";
import tough from "tough-cookie";
import { DOMParser } from "xmldom";
import xpath from "xpath";

export async function GET(request: Request) {
  request.headers.set("Cache-Control", "no-cache");

  const cookieJar = new tough.CookieJar();
  const fetch = fetchCookie(nodefetch, cookieJar);

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  const password = searchParams.get("password");
  if (!username || !password) return new Response("用户名或密码为空", { status: 400 });

  const loginPage = await fetch("https://lukkari.turkuamk.fi/rest/login");
  const sso = await fetch(loginPage.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `j_username=${username}&j_password=${password}&_eventId_proceed=`,
    redirect: "follow"
  });

  const htmlString = await sso.text();

  const doc = new DOMParser().parseFromString(htmlString);
  // @ts-ignore
  const RelayState = xpath.select("//input[@name='RelayState']/@value", doc)?.[0].nodeValue;
  // @ts-ignore
  const SAMLResponse = xpath.select("//input[@name='SAMLResponse']/@value", doc)?.[0].nodeValue;

  // return Response.json({ value: nodes?.[0].nodeValue });


  const urlencoded = new URLSearchParams();
  urlencoded.append("RelayState", RelayState);
  urlencoded.append("SAMLResponse", SAMLResponse);

  await fetch("https://lukkari.turkuamk.fi/Shibboleth.sso/SAML2/POST", {
    method: "POST",
    body: urlencoded,
    redirect: "follow",
    // @ts-ignore
    credentials: "include"
  });

  // 昨天的日期
  const dateFrom = dayjs().subtract(15, "day").format("YYYY-MM-DD");
  // 往后15天的日期
  const dateTo = dayjs().add(1, "month").format("YYYY-MM-DD");

  const events = await fetch("https://lukkari.turkuamk.fi/rest/basket/35517/events", {
    method: "POST",
    body: JSON.stringify({ dateFrom, dateTo, eventType: "visible" })
  });

  // 加载 JSON 数据
  const scheduleData = await events.json();

  // 芬兰时区
  const timezone = "Europe/Helsinki";

  // 创建一个新的日历
  const calendar = ical({ timezone: timezone });

  // 将 JSON 中的每个事件转换为 iCal 事件
  (scheduleData as any[]).forEach(item => {
    calendar.createEvent({
      start: moment.tz(item["start_date"], "YYYY-MM-DD HH:mm", timezone),
      end: moment.tz(item["end_date"], "YYYY-MM-DD HH:mm", timezone),
      summary: item["subject"] || "No Subject",
      location: item["location"]?.map((loc: any) => loc["class"])?.join(", "),
      description: `Reserved for: ${item["reserved_for"]?.join(", ")}\nStudent Groups: ${item["student_groups"]?.join(", ")}`
    });
  });

  return new Response(calendar.toString(), {
    headers: {
      "Content-Type": "text/calendar",
      "Content-Disposition": "attachment; filename=\"Turku_AMK.ics\""
    }
  });
}
