-- Sales regions move from a fixed enum to an admin-managed table. Codes are kept,
-- so existing staff, dealers, dealer requests and app_settings keys still match.
CREATE TABLE "sales_regions" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "sales_regions_pkey" PRIMARY KEY ("code")
);

CREATE UNIQUE INDEX "sales_regions_label_key" ON "sales_regions"("label");

INSERT INTO "sales_regions" ("code", "label") VALUES
    ('NORTH_1', 'North 1'),
    ('NORTH_2', 'North 2'),
    ('SOUTH_1', 'South 1'),
    ('SOUTH_2', 'South 2'),
    ('WEST_1', 'West 1'),
    ('WEST_2', 'West 2'),
    ('EAST', 'East'),
    ('ROM', 'ROM'),
    ('CENTRAL', 'Central');

ALTER TABLE "staff_profiles" ALTER COLUMN "sales_region" TYPE TEXT USING "sales_region"::TEXT;
ALTER TABLE "dealer_profiles" ALTER COLUMN "region" TYPE TEXT USING "region"::TEXT;
ALTER TABLE "dealer_requests" ALTER COLUMN "region" TYPE TEXT USING "region"::TEXT;

DROP TYPE "SalesRegion";
