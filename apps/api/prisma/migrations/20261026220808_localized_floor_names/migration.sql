-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "nameAr" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Floor" ADD COLUMN     "nameAr" TEXT NOT NULL DEFAULT '';

-- Data migration: earlier demo data stored bilingual names as "عربي / English" in one column.
-- Split them into the English `name` and Arabic `nameAr` columns.
UPDATE "Building" SET "nameAr" = trim(split_part("name", ' / ', 1)), "name" = trim(split_part("name", ' / ', 2))
WHERE "name" LIKE '% / %' AND "nameAr" = '';
UPDATE "Floor" SET "nameAr" = trim(split_part("name", ' / ', 1)), "name" = trim(split_part("name", ' / ', 2))
WHERE "name" LIKE '% / %' AND "nameAr" = '';
