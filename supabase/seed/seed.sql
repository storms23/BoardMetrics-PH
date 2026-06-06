-- Pasa Rate PH — seed data: 16 MVP programs + Philippine regions + key provinces.
-- Idempotent: safe to run multiple times.

-- ─── Programs (must match src/lib/programs.ts) ────────────────────────────────
insert into programs (exam_code, name, level, slug) values
  ('LET-E',  'Licensure Examination for Teachers (Elementary)', 'Elementary', 'let-elementary'),
  ('LET-S',  'Licensure Examination for Teachers (Secondary)',  'Secondary',  'let-secondary'),
  ('CPALE',  'Certified Public Accountant Licensure Examination', null, 'cpale'),
  ('NLE',    'Nurse Licensure Examination',                       null, 'nursing'),
  ('CLE',    'Criminologists Licensure Examination',              null, 'criminology'),
  ('CELE',   'Civil Engineers Licensure Examination',             null, 'civil-engineering'),
  ('ECE',    'Electronics Engineers Licensure Examination',       null, 'electronics-engineering'),
  ('REE',    'Registered Electrical Engineers Licensure Examination', null, 'electrical-engineering'),
  ('MELE',   'Mechanical Engineers Licensure Examination',        null, 'mechanical-engineering'),
  ('PLE',    'Physician Licensure Examination',                   null, 'medicine'),
  ('MTLE',   'Medical Technologists Licensure Examination',       null, 'medical-technology'),
  ('ALE',    'Architects Licensure Examination',                  null, 'architecture'),
  ('PhLE',   'Pharmacist Licensure Examination',                  null, 'pharmacy'),
  ('PSY',    'Psychologist / Psychometrician Licensure Examination', null, 'psychology'),
  ('DLE',    'Dentist Licensure Examination',                     null, 'dentistry'),
  ('AgriLE', 'Agriculturist Licensure Examination',               null, 'agriculture')
on conflict (exam_code) do update
  set name = excluded.name, level = excluded.level, slug = excluded.slug;

-- ─── Regions (17 PH administrative regions) ───────────────────────────────────
insert into regions (name, code) values
  ('National Capital Region', 'NCR'),
  ('Cordillera Administrative Region', 'CAR'),
  ('Ilocos Region', 'Region I'),
  ('Cagayan Valley', 'Region II'),
  ('Central Luzon', 'Region III'),
  ('CALABARZON', 'Region IV-A'),
  ('MIMAROPA', 'Region IV-B'),
  ('Bicol Region', 'Region V'),
  ('Western Visayas', 'Region VI'),
  ('Central Visayas', 'Region VII'),
  ('Eastern Visayas', 'Region VIII'),
  ('Zamboanga Peninsula', 'Region IX'),
  ('Northern Mindanao', 'Region X'),
  ('Davao Region', 'Region XI'),
  ('SOCCSKSARGEN', 'Region XII'),
  ('Caraga', 'Region XIII'),
  ('Bangsamoro', 'BARMM')
on conflict (name) do nothing;

-- ─── A few key provinces (extend as data is enriched) ─────────────────────────
insert into provinces (region_id, name)
select r.id, p.name
from (values
  ('National Capital Region', 'Metro Manila'),
  ('Central Luzon', 'Pampanga'),
  ('Central Luzon', 'Bulacan'),
  ('CALABARZON', 'Cavite'),
  ('CALABARZON', 'Laguna'),
  ('CALABARZON', 'Batangas'),
  ('Central Visayas', 'Cebu'),
  ('Western Visayas', 'Iloilo'),
  ('Davao Region', 'Davao del Sur'),
  ('Northern Mindanao', 'Misamis Oriental')
) as p(region_name, name)
join regions r on r.name = p.region_name
on conflict (region_id, name) do nothing;
