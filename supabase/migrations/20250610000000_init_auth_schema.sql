-- sectors (A–U)
create table sectors (
  id text primary key,
  name_es text not null,
  name_en text not null
);

-- activities (ISIC codes)
create table activities (
  code text primary key,
  sector_id text not null references sectors(id),
  name_es text not null,
  name_en text not null
);

create table investors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  wallet text not null unique,
  created_at timestamptz not null default now()
);

create table smes (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  about text not null,
  ruc text not null,
  wallet text not null unique,
  sector_id text not null references sectors(id),
  activity_code text not null references activities(code),
  created_at timestamptz not null default now()
);

alter table sectors enable row level security;
alter table activities enable row level security;
alter table investors enable row level security;
alter table smes enable row level security;

-- seed sectors
insert into sectors (id, name_es, name_en) values
  ('A', 'Agricultura, ganadería, silvicultura y pesca', 'Agriculture, forestry and fishing'),
  ('B', 'Explotación de minas y canteras', 'Mining and quarrying'),
  ('C', 'Industrias manufactureras', 'Manufacturing'),
  ('D', 'Suministro de electricidad, gas, vapor y aire acondicionado', 'Electricity, gas, steam and air conditioning supply'),
  ('E', 'Suministro de agua, evacuación de aguas residuales, gestión de desechos y descontaminación', 'Water supply; sewerage, waste management and remediation'),
  ('F', 'Construcción', 'Construction'),
  ('G', 'Comercio al por mayor y al por menor; reparación de vehículos automotores y motocicletas', 'Wholesale and retail trade; repair of motor vehicles and motorcycles'),
  ('H', 'Transporte y almacenamiento', 'Transportation and storage'),
  ('I', 'Alojamiento y servicios de comidas', 'Accommodation and food service activities'),
  ('J', 'Información y comunicación', 'Information and communication'),
  ('K', 'Actividades financieras y de seguros', 'Financial and insurance activities'),
  ('L', 'Actividades inmobiliarias', 'Real estate activities'),
  ('M', 'Actividades profesionales, científicas y técnicas', 'Professional, scientific and technical activities'),
  ('N', 'Actividades de servicios administrativos y de apoyo', 'Administrative and support service activities'),
  ('O', 'Administración pública y defensa; planes de seguridad social de afiliación obligatoria', 'Public administration and defence; compulsory social security'),
  ('P', 'Educación', 'Education'),
  ('Q', 'Actividades de atención de la salud humana y de asistencia social', 'Human health and social work activities'),
  ('R', 'Actividades artísticas, de entretenimiento y recreación', 'Arts, entertainment and recreation'),
  ('S', 'Otras actividades de servicios', 'Other service activities'),
  ('T', 'Actividades de los hogares como empleadores; actividades no diferenciadas de los hogares como productores de bienes y servicios para uso propio', 'Activities of households as employers; undifferentiated goods- and services-producing activities of households for own use'),
  ('U', 'Actividades de organizaciones y órganos extraterritoriales', 'Activities of extraterritorial organizations and bodies');

-- seed activities
insert into activities (code, sector_id, name_es, name_en) values
  ('0111', 'A', 'CULTIVO DE CEREALES (EXCEPTO ARROZ), LEGUMBRES Y SEMILLAS OLEAGINOSAS', 'Growing of cereals (except rice), leguminous crops and oil seeds'),
  ('0162', 'A', 'ACTIVIDADES DE APOYO A LA GANADERÍA', 'Support activities for animal production'),
  ('1071', 'C', 'ELABORACIÓN DE PRODUCTOS DE PANADERÍA.', 'Manufacture of bakery products'),
  ('1410', 'C', 'FABRICACIÓN DE PRENDAS DE VESTIR, EXCEPTO PRENDAS DE PIEL', 'Manufacture of wearing apparel, except fur apparel'),
  ('1520', 'C', 'FABRICACIÓN DE CALZADO', 'Manufacture of footwear'),
  ('1811', 'C', 'IMPRESIÓN', 'Printing'),
  ('1812', 'C', 'ACTIVIDADES DE SERVICIOS RELACIONADAS CON LA IMPRESIÓN.', 'Service activities related to printing'),
  ('2511', 'C', 'FABRICACIÓN DE PRODUCTOS METÁLICOS PARA USO ESTRUCTURAL', 'Manufacture of structural metal products'),
  ('3100', 'C', 'FABRICACIÓN DE MUEBLES', 'Manufacture of furniture'),
  ('4100', 'F', 'CONSTRUCCIÓN DE EDIFICIOS', 'Construction of buildings'),
  ('4321', 'F', 'INSTALACIONES ELÉCTRICAS', 'Electrical installation'),
  ('4330', 'F', 'TERMINACIÓN Y ACABADO DE EDIFICIOS', 'Building completion and finishing'),
  ('4520', 'G', 'MANTENIMIENTO Y REPARACIÓN DE VEHÍCULOS AUTOMOTORES', 'Maintenance and repair of motor vehicles'),
  ('4530', 'G', 'VENTAS DE PARTES, PIEZAS Y ACCESORIOS DE VEHÍCULOS AUTOMOTORES.', 'Sale of motor vehicle parts and accessories'),
  ('4730', 'G', 'VENTA AL POR MENOR DE COMBUSTIBLE PARA VEHÍCULOS AUTOMOTORES EN ALMACENES ESPECIALIZADOS.', 'Retail sale of automotive fuel in specialized stores'),
  ('4610', 'G', 'VENTA AL POR MAYOR A CAMBIO DE UNA RETRIBUCIÓN O POR CONTRATA.', 'Wholesale on a fee or contract basis'),
  ('4630', 'G', 'VENTA AL POR MAYOR DE ALIMENTOS, BEBIDAS Y TABACO.', 'Wholesale of food, beverages and tobacco'),
  ('4641', 'G', 'VENTA AL POR MAYOR DE PRODUCTOS TEXTILES, PRENDAS DE VESTIR Y CALZADO.', 'Wholesale of textiles, clothing and footwear'),
  ('4663', 'G', 'VENTA AL POR MAYOR DE MATERIALES DE CONSTRUCCIÓN, ARTÍCULOS DE FERRETERÍA Y EQUIPO Y MATERIALES DE FONTANERÍA Y CALEFACCIÓN.', 'Wholesale of construction materials, hardware, plumbing and heating equipment and supplies'),
  ('4690', 'G', 'VENTA AL POR MAYOR NO ESPECIALIZADA.', 'Non-specialized wholesale trade'),
  ('4711', 'G', 'VENTA AL POR MENOR EN ALMACENES NO ESPECIALIZADOS CON SURTIDO COMPUESTO PRINCIPALMENTE DE ALIMENTOS, BEBIDAS Y TABACO.', 'Retail sale in non-specialized stores with food, beverages or tobacco predominating'),
  ('4719', 'G', 'VENTA AL POR MENOR DE OTROS PRODUCTOS EN ALMACENES NO ESPECIALIZADOS.', 'Other retail sale in non-specialized stores'),
  ('4721', 'G', 'VENTA AL POR MENOR DE ALIMENTOS EN COMERCIOS ESPECIALIZADOS', 'Retail sale of food in specialized stores'),
  ('4772', 'G', 'VENTA AL POR MENOR DE PRODUCTOS FARMACÉUTICOS Y MEDICINALES, COSMÉTICOS Y ARTÍCULOS DE TOCADOR EN ALMACENES ESPECIALIZADOS.', 'Retail sale of pharmaceutical and medical goods, cosmetic and toilet articles in specialized stores'),
  ('4751', 'G', 'VENTA AL POR MENOR DE PRODUCTOS TEXTILES EN COMERCIOS ESPECIALIZADOS', 'Retail sale of textiles in specialized stores'),
  ('4759', 'G', 'VENTA AL POR MENOR DE APARATOS ELÉCTRICOS DE USO DOMÉSTICO, MUEBLES, EQUIPO DE ILUMINACIÓN Y OTROS ENSERES DOMÉSTICOS EN COMERCIOS ESPECIALIZADOS', 'Retail sale of electrical household appliances, furniture, lighting equipment and other household articles in specialized stores'),
  ('4752', 'G', 'VENTA AL POR MENOR DE ARTÍCULOS DE FERRETERÍA, PINTURAS Y PRODUCTOS DE VIDRIO EN ALMACENES ESPECIALIZADOS.', 'Retail sale of hardware, paints and glass in specialized stores'),
  ('4753', 'G', 'VENTA AL POR MENOR DE TAPICES, ALFOMBRAS Y CUBRIMIENTOS PARA PAREDES Y PISOS EN COMERCIOS ESPECIALIZADOS', 'Retail sale of carpets, rugs, wall and floor coverings in specialized stores'),
  ('4781', 'G', 'VENTA AL POR MENOR DE ALIMENTOS, BEBIDAS Y TABACO EN PUESTOS DE VENTA Y MERCADOS', 'Retail sale via stalls and markets of food, beverages and tobacco products'),
  ('4799', 'G', 'OTRAS ACTIVIDADES DE VENTA AL POR MENOR NO REALIZADAS EN COMERCIOS, PUESTOS DE VENTA O MERCADOS', 'Other retail sale not in stores, stalls or markets'),
  ('9522', 'S', 'REPARACIÓN DE APARATOS DE USO DOMÉSTICO Y EQUIPO DOMÉSTICO Y DE JARDINERÍA', 'Repair of household appliances and home and garden equipment'),
  ('5510', 'I', 'ACTIVIDADES DE ALOJAMIENTO PARA ESTANCIAS CORTAS', 'Short term accommodation activities'),
  ('5610', 'I', 'ACTIVIDADES DE RESTAURANTES Y DE SERVICIO MÓVIL DE COMIDAS', 'Restaurants and mobile food service activities'),
  ('4921', 'H', 'TRANSPORTE URBANO Y SUBURBANO DE PASAJEROS POR VÍA TERRESTRE', 'Urban and suburban passenger land transport'),
  ('4922', 'H', 'OTROS TIPOS DE TRANSPORTE NO REGULAR DE PASAJEROS POR VÍA TERRESTRE.', 'Other passenger land transport'),
  ('4923', 'H', 'TRANSPORTE DE CARGA POR CARRETERA.', 'Freight transport by road'),
  ('7911', 'N', 'ACTIVIDADES DE AGENCIAS DE VIAJES', 'Travel agency activities'),
  ('6810', 'L', 'ACTIVIDADES INMOBILIARIAS REALIZADAS CON BIENES PROPIOS O ARRENDADOS', 'Real estate activities with own or leased property'),
  ('6201', 'J', 'PROGRAMACIÓN INFORMÁTICA', 'Computer programming'),
  ('6311', 'J', 'PROCESAMIENTO DE DATOS, HOSPEDAJE Y ACTIVIDADES CONEXAS', 'Data processing, hosting and related activities'),
  ('9511', 'S', 'REPARACIÓN DE ORDENADORES Y EQUIPO PERIFÉRICO', 'Repair of computers and peripheral equipment'),
  ('6209', 'J', 'OTROS SERVICIOS INFORMÁTICOS Y DE TECNOLOGÍAS DE LA INFORMACIÓN.', 'Other information technology and computer service activities'),
  ('7220', 'M', 'INVESTIGACIONES Y DESARROLLO EXPERIMENTAL EN EL CAMPO DE LAS CIENCIAS SOCIALES Y LAS HUMANIDADES.', 'Research and experimental development on social sciences and humanities'),
  ('6910', 'M', 'ACTIVIDADES JURÍDICAS.', 'Legal activities'),
  ('6920', 'M', 'ACTIVIDADES DE CONTABILIDAD, TENEDURÍA DE LIBROS Y AUDITORÍA; ASESORAMIENTO EN MATERIA DE IMPUESTOS.', 'Accounting, bookkeeping and auditing activities; tax consultancy'),
  ('7020', 'M', 'ACTIVIDADES DE CONSULTORÍA DE GESTIÓN', 'Management consultancy activities'),
  ('7110', 'M', 'ACTIVIDADES DE ARQUITECTURA E INGENIERÍA Y ACTIVIDADES CONEXAS DE CONSULTORÍA TÉCNICA', 'Architectural and engineering activities and related technical consultancy'),
  ('7310', 'M', 'PUBLICIDAD.', 'Advertising'),
  ('8020', 'N', 'ACTIVIDADES DE SERVICIO DE SISTEMAS DE SEGURIDAD', 'Security systems service activities'),
  ('8129', 'N', 'OTRAS ACTIVIDADES DE LIMPIEZA DE EDIFICIOS E INSTALACIONES INDUSTRIALES', 'Other building and industrial cleaning activities'),
  ('8299', 'N', 'OTRAS ACTIVIDADES DE SERVICIOS DE APOYO A LAS EMPRESAS N.C.P', 'Other business support service activities n.e.c.'),
  ('8411', 'O', 'ACTIVIDADES DE LA ADMINISTRACIÓN PÚBLICA EN GENERAL.', 'General public administration activities'),
  ('8510', 'P', 'ENSEÑANZA PRE-ESCOLAR Y PRIMARIA.', 'Pre-primary and primary education'),
  ('8521', 'P', 'ENSEÑANZA SECUNDARIA DE FORMACIÓN GENERAL.', 'General secondary education'),
  ('8530', 'P', 'ENSEÑANZA SUPERIOR.', 'Higher education'),
  ('8549', 'P', 'OTROS TIPOS DE ENSEÑANZA N.C.P.', 'Other education n.e.c.'),
  ('8620', 'Q', 'ACTIVIDADES DE MÉDICOS Y ODONTÓLOGOS.', 'Medical and dental practice activities'),
  ('8690', 'Q', 'OTRAS ACTIVIDADES DE ATENCIÓN DE LA SALUD HUMANA', 'Other human health activities'),
  ('9499', 'S', 'ACTIVIDADES DE OTRAS ASOCIACIONES N.C.P.', 'Activities of other membership organizations n.e.c.'),
  ('6020', 'J', 'PROGRAMACIÓN Y TRANSMISIONES DE TELEVISIÓN', 'Television programming and broadcasting activities'),
  ('9000', 'R', 'ACTIVIDADES CREATIVAS, ARTÍSTICAS Y DE ENTRETENIMIENTO', 'Creative, arts and entertainment activities'),
  ('9312', 'R', 'ACTIVIDADES DE CLUBES DEPORTIVOS', 'Activities of sports clubs'),
  ('9602', 'S', 'PELUQUERÍA Y OTROS TRATAMIENTOS DE BELLEZA.', 'Hairdressing and other beauty treatment');
