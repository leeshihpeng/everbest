// 本機測試用種子資料：3 個角色帳號（業務／主管／送貨）+ 範例客戶 + 今日範例派遣單。
// 開發環境沒有 GOOGLE_MAPS_API_KEY，所以這裡直接手動塞座標，讓路線最佳化可以馬上測試。
// 執行：npm run prisma:seed --workspace=apps/api（或 npx prisma db seed）

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { rolesToString } from "../src/utils/roles";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "1234";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.systemSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      companyAddress: "台北市中山區南京東路一段1號",
      companyLat: 25.0523,
      companyLng: 121.5271,
    },
  });

  const sales = await prisma.staff.upsert({
    where: { id: "seed-staff-sales" },
    update: {},
    create: {
      id: "seed-staff-sales",
      name: "王小明",
      roles: rolesToString(["SALES"]),
      homeAddress: "台北市大安區信義路四段1號",
      homeLat: 25.0339,
      homeLng: 121.5645,
      passwordHash,
    },
  });

  const manager = await prisma.staff.upsert({
    where: { id: "seed-staff-manager" },
    update: {},
    create: {
      id: "seed-staff-manager",
      name: "陳主管",
      roles: rolesToString(["MANAGER"]),
      homeAddress: "台北市中山區民權東路二段1號",
      homeLat: 25.0629,
      homeLng: 121.5316,
      passwordHash,
    },
  });

  const driver = await prisma.staff.upsert({
    where: { id: "seed-staff-driver" },
    update: {},
    create: {
      id: "seed-staff-driver",
      name: "林師傅",
      roles: rolesToString(["DRIVER"]),
      homeAddress: "新北市板橋區文化路一段1號",
      homeLat: 25.0173,
      homeLng: 121.4628,
      passwordHash,
    },
  });

  const customers = [
    { code: "C001", name: "台北五金行", address: "台北市中正區重慶南路一段1號", city: "台北市", isPriority: true, lat: 25.0342, lng: 121.512 },
    { code: "C002", name: "信義超商", address: "台北市信義區松高路1號", city: "台北市", isPriority: false, lat: 25.0339, lng: 121.5645 },
    { code: "C003", name: "大安餐飲", address: "台北市大安區敦化南路一段1號", city: "台北市", isPriority: true, lat: 25.0418, lng: 121.5498 },
    { code: "C004", name: "板橋批發商", address: "新北市板橋區縣民大道一段1號", city: "新北市", isPriority: false, lat: 25.0141, lng: 121.4646 },
    { code: "C005", name: "三重五金", address: "新北市三重區重新路一段1號", city: "新北市", isPriority: false, lat: 25.0632, lng: 121.4879 },
    { code: "C006", name: "桃園量販", address: "桃園市桃園區中正路1號", city: "桃園市", isPriority: true, lat: 24.9937, lng: 121.301 },
    { code: "C007", name: "中壢商店", address: "桃園市中壢區中正路1號", city: "桃園市", isPriority: false, lat: 24.9536, lng: 121.2258 },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        address: c.address,
        city: c.city,
        phone: "02-12345678",
        isPriority: c.isPriority,
        lat: c.lat,
        lng: c.lng,
      },
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orderSeeds = [
    { customer: customers[0], priority: true, products: [{ productName: "螺絲組", quantity: 10 }] },
    { customer: customers[1], priority: false, products: [{ productName: "礦泉水", quantity: 24 }] },
    { customer: customers[2], priority: true, products: [{ productName: "餐具組", quantity: 5 }] },
    { customer: customers[3], priority: false, products: [{ productName: "紙箱", quantity: 50 }, { productName: "膠帶", quantity: 20 }] },
  ];

  for (const o of orderSeeds) {
    const existing = await prisma.dispatchOrder.findFirst({
      where: { customerCode: o.customer.code, deliveryDate: today },
    });
    if (existing) continue;

    const order = await prisma.dispatchOrder.create({
      data: {
        deliveryDate: today,
        customerCode: o.customer.code,
        customerName: o.customer.name,
        address: o.customer.address,
        phone: "02-12345678",
        isPriority: o.priority,
        lat: o.customer.lat,
        lng: o.customer.lng,
        items: { create: o.products },
      },
    });

    await prisma.notification.create({
      data: {
        orderId: order.id,
        staffId: manager.id,
        message: `新派遣單待確認：${order.customerName}（${order.customerCode}）`,
      },
    });
  }

  console.log("種子資料完成：");
  console.log(`- 業務：${sales.name} / 密碼 ${DEMO_PASSWORD}`);
  console.log(`- 主管：${manager.name} / 密碼 ${DEMO_PASSWORD}`);
  console.log(`- 送貨：${driver.name} / 密碼 ${DEMO_PASSWORD}`);
  console.log(`- 客戶：${customers.length} 筆`);
  console.log(`- 今日派遣單：${orderSeeds.length} 筆`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
