import ical from "ical-generator";
import moment from "moment-timezone";
import puppeteer from "puppeteer";


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");
  const password = searchParams.get("password");
  if (!username || !password) return new Response("用户名或密码为空", { status: 400 });

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // 进入目标页面
  await page.goto("https://lukkari.turkuamk.fi/");

  // 点击“Kirjaudu sisään”按钮，使用你提供的选择器
  const buttonSelector = "body > app-root > mat-sidenav-container > mat-sidenav-content > mat-toolbar > mat-toolbar-row > button:nth-child(5)";
  await page.waitForSelector(buttonSelector);
  await page.click(buttonSelector);

  // 等待跳转到登录页面
  await page.waitForSelector("#username");  // 等待某个特定的元素出现

  // 输入用户名和密码
  await page.type("#username", username); // 假设用户名输入框的ID为'username'
  await page.type("#password", password); // 假设密码输入框的ID为'password'

  // 提交表单
  await page.click("button[type=\"submit\"]"); // 假设登录按钮是一个submit按钮

  // 等待页面跳转回来
  await page.waitForNavigation();

  // 获取当前页面的Cookie
  const cookies = await page.cookies();
  await browser.close();

  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
  const dateFrom = searchParams.get("dateFrom") || new Date().toISOString().split("T")[0];
  const dateTo = searchParams.get("dateTo") || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split("T")[0];
  const res = await fetch("https://lukkari.turkuamk.fi/rest/basket/35517/events", {
    method: "POST",
    headers: {
      "Cookie": cookieString
    },
    body: JSON.stringify({ dateFrom, dateTo, eventType: "visible" })
  });

  // // 加载 JSON 数据
  const scheduleData = await res.json();

  // 芬兰时区
  const timezone = "Europe/Helsinki";

  // 创建一个新的日历
  const calendar = ical({ timezone: timezone });

  // 将 JSON 中的每个事件转换为 iCal 事件
  scheduleData.forEach((item: any) => {
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
