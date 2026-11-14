// Arabic labels for the navigation and common words. Pages keep English content for now.
export const AR: Record<string, string> = {
  Main: "الرئيسية", Sales: "المبيعات", Inventory: "المخزون", Service: "الخدمات", Finance: "المالية", Team: "الفريق", Administration: "الإدارة", Pinned: "المثبتة",
  Dashboard: "لوحة التحكم", "New sale": "بيع جديد", "Orders & quotes": "الطلبات وعروض الأسعار", Invoices: "الفواتير", Customers: "العملاء", "CRM & leads": "علاقات العملاء",
  "Coupons & loyalty": "القسائم والولاء", Shipping: "الشحن", "Products & stock": "المنتجات والمخزون", "Warehouses & moves": "المستودعات والحركات", "IMEI lookup": "بحث IMEI",
  Purchases: "المشتريات", Suppliers: "الموردون", Repairs: "الصيانة", "Support tickets": "تذاكر الدعم", "Buy used": "شراء المستعمل", Expenses: "المصروفات", Accounting: "المحاسبة",
  Reports: "التقارير", "HR & payroll": "الموارد البشرية والرواتب", "Tasks & projects": "المهام والمشاريع", Calendar: "التقويم", Website: "الموقع", Automation: "الأتمتة", Settings: "الإعدادات",
  Search: "بحث", "Sign out": "تسجيل الخروج", "My account": "حسابي", Notifications: "الإشعارات",
};
export const tr = (lang: string, s: string) => (lang === "ar" ? AR[s] ?? s : s);
