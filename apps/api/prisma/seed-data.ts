/**
 * DEVELOPMENT / TEST SEED DATA. Fictional hotels, rooms, rates and staff accounts.
 * Never run against production (seed.ts refuses when NODE_ENV=production).
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { DEFAULT_ROLES } from '@collex/shared';

export interface SeedResult {
  groupId: string;
  properties: Record<string, { id: string; categories: Record<string, string>; ratePlans: Record<string, string>; floors: string[] }>;
  users: Record<string, string>;
}

const STAFF: { key: string; email: string; name: string; role: string; property: 'RUH' | 'JED' | null }[] = [
  { key: 'admin', email: 'admin@collex.test', name: 'مدير المنصة', role: 'PLATFORM_ADMIN', property: null },
  { key: 'manager', email: 'manager.ruh@collex.test', name: 'سارة القحطاني', role: 'PROPERTY_MANAGER', property: 'RUH' },
  { key: 'reception', email: 'reception.ruh@collex.test', name: 'أحمد العتيبي', role: 'RECEPTIONIST', property: 'RUH' },
  { key: 'agent', email: 'agent.ruh@collex.test', name: 'Lina Haddad', role: 'RESERVATION_AGENT', property: 'RUH' },
  { key: 'cashier', email: 'cashier.ruh@collex.test', name: 'خالد الدوسري', role: 'CASHIER', property: 'RUH' },
  { key: 'hksup', email: 'hk.supervisor.ruh@collex.test', name: 'مريم الزهراني', role: 'HK_SUPERVISOR', property: 'RUH' },
  { key: 'hk', email: 'hk.ruh@collex.test', name: 'Rosa Santos', role: 'HK_STAFF', property: 'RUH' },
  { key: 'maint', email: 'maintenance.ruh@collex.test', name: 'Omar Farouk', role: 'MAINTENANCE', property: 'RUH' },
  { key: 'auditor', email: 'auditor@collex.test', name: 'نورة الشمري', role: 'AUDITOR', property: 'RUH' },
  { key: 'receptionJed', email: 'reception.jed@collex.test', name: 'فهد الحربي', role: 'RECEPTIONIST', property: 'JED' },
];

export async function seed(prisma: PrismaClient, password: string): Promise<SeedResult> {
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const group = await prisma.hotelGroup.create({ data: { name: 'Collex Hospitality (Demo)' } });

  // Platform-wide role (no group). Compound unique keys cannot match NULL, so look it up explicitly.
  const platformRole =
    (await prisma.role.findFirst({ where: { groupId: null, code: 'PLATFORM_ADMIN' } })) ??
    (await prisma.role.create({ data: { code: 'PLATFORM_ADMIN', nameEn: 'Platform administrator', nameAr: 'مدير المنصة', permissions: DEFAULT_ROLES[0].permissions, system: true } }));
  const roles: Record<string, string> = { PLATFORM_ADMIN: platformRole.id };
  for (const r of DEFAULT_ROLES.filter((x) => x.code !== 'PLATFORM_ADMIN')) {
    const role = await prisma.role.create({ data: { groupId: group.id, code: r.code, nameEn: r.nameEn, nameAr: r.nameAr, permissions: r.permissions, system: true } });
    roles[r.code] = role.id;
  }

  const result: SeedResult = { groupId: group.id, properties: {}, users: {} };
  const defs = [
    { code: 'RUH', name: 'Collex Riyadh', nameAr: 'كوليكس الرياض', city: 'Riyadh', floors: 3, perFloor: 8 },
    { code: 'JED', name: 'Collex Jeddah Corniche', nameAr: 'كوليكس جدة الكورنيش', city: 'Jeddah', floors: 2, perFloor: 6 },
  ];
  for (const def of defs) {
    const existing = await prisma.property.findUnique({ where: { code: def.code } });
    const code = existing ? `${def.code}${Math.floor(Math.random() * 9000 + 1000)}` : def.code;
    const property = await prisma.property.create({
      data: {
        groupId: group.id,
        code,
        name: def.name,
        nameAr: def.nameAr,
        city: def.city,
        timezone: 'Asia/Riyadh',
        currency: 'SAR',
        taxPercent: 15,
        serviceChargePercent: 0,
        address: `${def.city}, Saudi Arabia`,
        phone: '+966 11 000 0000',
        email: `stay.${def.code.toLowerCase()}@collex.test`,
        amenities: ['WIFI', 'POOL', 'GYM', 'PARKING', 'RESTAURANT', 'AIRPORT_SHUTTLE'],
        descriptionAr: 'فندق عصري في قلب المدينة يجمع بين الضيافة العربية الأصيلة والراحة الحديثة. (بيانات تجريبية)',
        descriptionEn: 'A modern hotel in the heart of the city combining authentic Arabian hospitality with contemporary comfort. (Demo data)',
        policiesAr: 'تسجيل الدخول من الساعة 3 مساءً وتسجيل المغادرة حتى 12 ظهراً. يلزم تقديم وثيقة هوية سارية لجميع النزلاء البالغين.',
        policiesEn: 'Check-in from 3 PM, check-out until 12 PM. A valid identity document is required for all adult guests.',
      },
    });
    await prisma.checkInPolicy.create({
      data: { propertyId: property.id, documentScope: 'ALL_ADULTS', acceptedTypes: ['PASSPORT', 'NATIONAL_ID', 'RESIDENCE_PERMIT'], requireVerification: true, allowExceptions: true, homeCountry: 'SA', documentRetentionDays: 365 },
    });
    await prisma.documentTypeConfig.createMany({
      data: [
        { propertyId: property.id, code: 'PASSPORT', nameEn: 'Passport', nameAr: 'جواز سفر', multiPage: true, requiredFields: ['issuingCountry', 'expiryDate'] },
        { propertyId: property.id, code: 'NATIONAL_ID', nameEn: 'National ID card', nameAr: 'بطاقة الهوية الوطنية', requiresBack: false, requiredFields: ['expiryDate'] },
        { propertyId: property.id, code: 'RESIDENCE_PERMIT', nameEn: 'Residence permit (Iqama)', nameAr: 'إقامة', requiredFields: ['expiryDate'] },
        { propertyId: property.id, code: 'DRIVING_LICENSE', nameEn: 'Driving licence', nameAr: 'رخصة قيادة', active: false },
        { propertyId: property.id, code: 'OTHER', nameEn: 'Other government ID', nameAr: 'وثيقة حكومية أخرى', active: false },
      ],
    });
    const categories = {
      STD: await prisma.roomCategory.create({ data: { propertyId: property.id, code: 'STD', nameEn: 'Standard Room', nameAr: 'غرفة قياسية', descriptionEn: 'Comfortable room with a queen bed and city view.', descriptionAr: 'غرفة مريحة بسرير كوين وإطلالة على المدينة.', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, baseOccupancy: 2, bedConfig: 'QUEEN', amenities: ['WIFI', 'TV', 'SAFE'], sizeSqm: 28, rank: 1 } }),
      DLX: await prisma.roomCategory.create({ data: { propertyId: property.id, code: 'DLX', nameEn: 'Deluxe Room', nameAr: 'غرفة ديلوكس', descriptionEn: 'Spacious room with a king bed and seating area.', descriptionAr: 'غرفة واسعة بسرير كينج وجلسة خاصة.', maxAdults: 2, maxChildren: 2, maxOccupancy: 4, baseOccupancy: 2, bedConfig: 'KING', amenities: ['WIFI', 'TV', 'SAFE', 'MINIBAR', 'COFFEE'], sizeSqm: 36, rank: 2 } }),
      FAM: await prisma.roomCategory.create({ data: { propertyId: property.id, code: 'FAM', nameEn: 'Family Room', nameAr: 'غرفة عائلية', descriptionEn: 'Two queen beds, ideal for families.', descriptionAr: 'سريران كوين، مثالية للعائلات.', maxAdults: 4, maxChildren: 3, maxOccupancy: 5, baseOccupancy: 2, bedConfig: 'TWO_QUEEN', amenities: ['WIFI', 'TV', 'SAFE', 'MINIBAR'], sizeSqm: 42, rank: 2 } }),
      STE: await prisma.roomCategory.create({ data: { propertyId: property.id, code: 'STE', nameEn: 'Executive Suite', nameAr: 'جناح تنفيذي', descriptionEn: 'Separate living room, king bed and panoramic views.', descriptionAr: 'صالة معيشة منفصلة وسرير كينج وإطلالة بانورامية.', maxAdults: 3, maxChildren: 2, maxOccupancy: 4, baseOccupancy: 2, bedConfig: 'KING', amenities: ['WIFI', 'TV', 'SAFE', 'MINIBAR', 'COFFEE', 'BATHTUB', 'LOUNGE_ACCESS'], sizeSqm: 65, rank: 3 } }),
    };
    const building = await prisma.building.create({ data: { propertyId: property.id, name: 'Main building', nameAr: 'المبنى الرئيسي' } });
    const floorIds: string[] = [];
    for (let f = 1; f <= def.floors; f++) {
      const floor = await prisma.floor.create({ data: { propertyId: property.id, buildingId: building.id, name: `Floor ${f}`, nameAr: `الطابق ${f}`, level: f } });
      floorIds.push(floor.id);
      const layout = await prisma.floorPlanLayout.create({ data: { floorId: floor.id, width: 1200, height: 520 } });
      for (let i = 1; i <= def.perFloor; i++) {
        const cat = f === def.floors && i > def.perFloor - 2 ? categories.STE : i % 4 === 0 ? categories.FAM : i % 3 === 0 ? categories.DLX : categories.STD;
        const room = await prisma.room.create({
          data: {
            propertyId: property.id,
            floorId: floor.id,
            categoryId: cat.id,
            number: `${f}${String(i).padStart(2, '0')}`,
            accessible: f === 1 && i === 1,
            bedType: cat.bedConfig,
            features: i % 2 === 0 ? ['CITY_VIEW'] : ['QUIET'],
          },
        });
        const half = Math.ceil(def.perFloor / 2);
        const top = i <= half;
        const col = top ? i - 1 : i - half - 1;
        await prisma.roomGeometry.create({ data: { layoutId: layout.id, roomId: room.id, x: 40 + col * 140, y: top ? 40 : 320, w: 120, h: 160, rotation: 0 } });
      }
    }
    const from = new Date('2026-01-01');
    const to = new Date('2028-01-01');
    const base: Record<string, number> = { STD: 450, DLX: 650, FAM: 780, STE: 1200 };
    const plans = {
      BAR: await prisma.ratePlan.create({ data: { propertyId: property.id, code: 'BAR', nameEn: 'Best Available Rate', nameAr: 'أفضل سعر متاح', refundable: true, freeCancellationHours: 24, penaltyNights: 1, depositPercent: 0 } }),
      NRF: await prisma.ratePlan.create({ data: { propertyId: property.id, code: 'NRF', nameEn: 'Non-refundable (save 10%)', nameAr: 'غير قابل للاسترداد (وفّر 10%)', refundable: false, freeCancellationHours: 0, penaltyNights: 0, depositPercent: 100, discountPercent: 10 } }),
      CORP: await prisma.ratePlan.create({ data: { propertyId: property.id, code: 'CORP', nameEn: 'Corporate rate', nameAr: 'سعر الشركات', public: false, corporateAccount: 'ACME', discountPercent: 15 } }),
      PROMO: await prisma.ratePlan.create({ data: { propertyId: property.id, code: 'WELCOME', nameEn: 'Welcome offer', nameAr: 'عرض الترحيب', promoCode: 'WELCOME20', discountPercent: 20, minStay: 2 } }),
    };
    for (const plan of Object.values(plans)) {
      for (const [codeKey, cat] of Object.entries(categories)) {
        await prisma.ratePrice.create({ data: { ratePlanId: plan.id, categoryId: cat.id, startDate: from, endDate: to, amount: base[codeKey], extraAdultAmount: 100, extraChildAmount: 50, priority: 0 } });
        // Weekend (Thu/Fri nights) uplift
        await prisma.ratePrice.create({ data: { ratePlanId: plan.id, categoryId: cat.id, startDate: from, endDate: to, weekdays: [4, 5], amount: Math.round(base[codeKey] * 1.2), extraAdultAmount: 100, extraChildAmount: 50, priority: 10 } });
      }
    }
    result.properties[def.code] = {
      id: property.id,
      categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.id])),
      ratePlans: Object.fromEntries(Object.entries(plans).map(([k, v]) => [k, v.id])),
      floors: floorIds,
    };
  }

  for (const s of STAFF) {
    const email = s.email;
    let user = await prisma.user.findUnique({ where: { email } });
    user ??= await prisma.user.create({ data: { email, fullName: s.name, passwordHash, locale: /[a-z]/i.test(s.name[0]) ? 'en' : 'ar' } });
    const propertyId = s.property ? result.properties[s.property].id : null;
    await prisma.userRole.create({ data: { userId: user.id, roleId: roles[s.role], propertyId } });
    result.users[s.key] = user.id;
  }
  return result;
}
