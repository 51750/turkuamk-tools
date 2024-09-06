import fetchCookie from "fetch-cookie";
import ical from "ical-generator";
import moment from "moment-timezone";
import nodefetch from "node-fetch";
import tough from "tough-cookie";

export async function GET(request: Request) {
  request.headers.set("Cache-Control", "no-cache");

  const cookieJar = new tough.CookieJar();
  const fetch = fetchCookie(nodefetch, cookieJar);

  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  const password = searchParams.get("password");
  if (!username || !password) return new Response("用户名或密码为空", { status: 400 });

  const dateFrom = searchParams.get("dateFrom") || new Date().toISOString().split("T")[0];
  const dateTo = searchParams.get("dateTo") || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split("T")[0];

  await fetch("https://lukkari.turkuamk.fi/rest/user/");
  // return new Response(user.headers.get("Set-Cookie"));

  const restlogin = await fetch("https://lukkari.turkuamk.fi/rest/login");

  const sso = await fetch(restlogin.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `j_username=${username}&j_password=${password}&_eventId_proceed=`,
    redirect: "follow"
  });

  let htmlString = await sso.text();
  // return new Response(htmlString, { headers: { "Content-Type": "text/html", } });

  const relayStateMatch = htmlString.match(/name="RelayState" value="([^"]*)"/);
  const samlResponseMatch = htmlString.match(/name="SAMLResponse" value="([^"]*)"/);

  const RelayState = relayStateMatch ? relayStateMatch[1] : null;
  const SAMLResponse = samlResponseMatch ? samlResponseMatch[1] : null;
  // return new Response(`RelayState: ${RelayState}\nSAMLResponse: ${SAMLResponse}`);

  const login = await fetch("https://lukkari.turkuamk.fi/", {
    "headers": {
      "content-type": "application/x-www-form-urlencoded",
    },
    // "body": `RelayState=${RelayState}&SAMLResponse=${SAMLResponse}`,
    // "method": "GET"
  });

  // return new Response(postloginResponse.headers.get("SeCookie"));

  const res = await fetch("https://lukkari.turkuamk.fi/rest/basket/35517/events", {
    method: "POST",
    body: JSON.stringify({ dateFrom, dateTo, eventType: "visible" })
  });

  // 加载 JSON 数据
  const scheduleData = await res.json();

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
      description: `Reserved for: ${item["reserved_for"].join(", ")}\nStudent Groups: ${item["student_groups"].join(", ")}`
    });
  });

  return new Response(calendar.toString(), {
    headers: {
      "Content-Type": "text/calendar",
      "Content-Disposition": "attachment; filename=\"Turku_AMK.ics\""
    }
  });
}
