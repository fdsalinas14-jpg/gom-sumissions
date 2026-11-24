// Listes de prix des fournisseurs de Climatisation GOM (transcrites telles quelles, sans les prix coûtants):
//   « Prix Kinghome R32 – à partir du 2 mai 2026 » et « Prix Zephyr R32 et R454b – à partir du 17 juillet 2025 ».
// Le vendeur écrit le prix de vente: on garde seulement modèles, fiches techniques, AHRI et subventions LogisVert.
// Tuyaux: la liste écrit « liquide - gaz » (ex. 1/4 - 3/8). Dimensions: telles que la liste les écrit (pouces).

// [btu, seer2, hspf2, ahri, energyStar, disjoncteur A, tuyaux, volts, intérieur, dims int., extérieur, dims ext., subvention]
const W = (rows) => rows.map(([btu, seer2, hspf2, ahri, es, breaker, lines, volt, indoor, dimsIn, outdoor, dimsOut, subsidy]) =>
  ({ btu, seer2, hspf2, ahri, es, breaker, lines, volt, indoor, dimsIn, outdoor, dimsOut, subsidy }));

export const KINGHOME = {
  warranty: { fr: '12 ans – pièces et compresseur', en: '12 years – parts and compressor' },
  ref: 'R-32',
  wall: [
    { series: 'Charmo', rows: W([
      [9000, 20.5, 8.8, '218679827', '4669358', 15, '1/4 - 3/8', 230, 'KW09HQ19CDI', '32-7/8 x 10-53/64 x 7-7/8', 'KW09HQ19CDO', '28-13/16 x 21-7/8 x 12-63/64', 0],
      [12000, 19, 8.5, '217956851', '4514328', 15, '1/4 - 3/8', 230, 'KW12HQ19CDI', '32-7/8 x 10-53/64 x 7-7/8', 'KW12HQ19CDO', '28-13/16 x 21-7/8 x 12-63/64', 1164],
      [18000, 20, 8.5, '218029881', '4520600', 15, '1/4 - 1/2', 230, 'KW18HQ19CDI', '37-1/8 x 13-7/64 x 9-11/16', 'KW18HQ19CDO', '31-37/64 x 21-27/32 x 13-25/32', 1836],
      [24000, 19, 8.5, '217995506', '4515403', 20, '1/4 - 1/2', 230, 'KW24HQ19CDI', '42-7/16 x 13-7/64 x 9-11/16', 'KW24HQ19CDO', '37-23/32 x 25-63/64 x 15-53/64', 2304],
      [30000, 22, 9, '216772294', '4514290', 30, '1/4 - 5/8', 230, 'KW30XQ21CDI', '42-7/16 x 13-7/64 x 9-11/16', 'KW30XQ21CDO', '39-3/8 x 29-3/8 x 16-13/16', 2880],
      [36000, 21, 8.5, '216772293', '3995738', 30, '1/4 - 5/8', 230, 'KW36XQ21CDI', '42-7/16 x 13-7/64 x 9-11/16', 'KW36XQ21CDO', '39-3/8 x 29-3/8 x 16-3/16', 3288],
    ]) },
    { series: 'Clivia', rows: W([
      [9000, 26, 10.4, '217933617', '4518151', 15, '1/4 - 3/8', 230, 'KW09XQ25S1DI', '32-31/64 x 11-17/32 x 7-23/32', 'KW09XQ25S1DO', '31-37/64 x 21-27/32 x 13-25/32', 0],
      [12000, 24.5, 9.5, '218448716', '4657134', 15, '1/4 - 1/2', 230, 'KW12XQ25S1DI', '32-31/64 x 11-17/32 x 7-23/32', 'KW12XQ25S1DO', '31-37/64 x 21-27/32 x 13-25/32', 1440],
      [18000, 24.5, 9, '217933615', '4514316', 20, '1/4 - 1/2', 230, 'KW18XQ25S1DI', '38-21/32 x 12-1/4 x 8-45/64', 'KW18XQ25S1DO', '37-23/32 x 25-63/64 x 15-53/64', 2160],
      [24000, 26, 10, '217933616', '4518150', 30, '1/4 - 5/8', 230, 'KW24XQ25S1DI', '42-21/64 x 13-7/64 x 9-11/16', 'KW24XQ25S1DO', '37-23/32 x 25-63/64 x 15-53/64', 2400],
    ]) },
    { series: 'Polaris', note: 'Liste: « Nous estimons les stocks de Polaris arriveront à la fin du mois d’août »; subvention LogisVert à partir du 1er juin 2026.', rows: W([
      [9000, 27, 10.6, '218451121', '4617798', 15, '1/4 - 1/2', 230, 'KWP09R32C3I', '35-14/32 x 10-55/64 x 8-10/64', 'KWP09R32C3O', '34-3/8 x 21-21/32 x 14-51/64', 0],
      [12000, 25.5, 9.5, '218451122', '4617797', 15, '1/4 - 1/2', 230, 'KWP12R32C3I', '35-14/32 x 10-55/64 x 8-10/64', 'KWP12R32C3O', '34-3/8 x 21-21/32 x 14-51/64', 1800],
      [18000, 24.5, 9, '218640147', '4663287', 20, '1/4 - 1/2', 230, 'KWP18R32C3I', '39-15/16 x 13-1/8 x 9-15/16', 'KWP18R32C3O', '37-11/16 x 25-15/16 x 15-13/16', 2448],
      [24000, 24, 9, '218640282', '4663298', 30, '1/4 - 5/8', 230, 'KWP24R32C3I', '43-15/16 x 13-7/64 x 9-49/64', 'KWP24R32C3O', '37-23/32 x 25-63/64 x 15-53/64', 3120],
    ]) },
    { series: 'Airy', rows: W([
      [9000, 30, 11.2, '217903557', '4514302', 15, '1/4 - 1/2', 230, 'KW09XQ29S1DI', '38-3/16 x 13-21/32 x 10-1/8', 'KW09XQ29S1DO', '34-3/8 x 21-27/32 x 14-51/64', 0],
      [12000, 27, 10, '218448717', '4617768', 15, '1/4 - 1/2', 230, 'KW12XQ29S1DI', '38-3/16 x 13-21/32 x 10-1/8', 'KW12XQ29S1DO', '34-3/8 x 21-27/32 x 14-51/64', 1560],
      [18000, 27.5, 9.7, '217903559', '4514304', 25, '1/4 - 5/8', 230, 'KW18XQ29S1DI', '43-45/64 x 13-21/32 x 10-1/8', 'KW18XQ29S1DO', '37-23/32 x 25-63/64 x 15-53/64', 2340],
      [24000, 27.5, 10, '217903553', '4514301', 40, '1/4 - 5/8', 230, 'KW24XQ29S1DI', '43-45/64 x 13-21/32 x 10-1/8', 'KW24XQ29S1DO', '39-3/8 x 29-3/8 x 16-13/16', 2760],
    ]) },
  ],
  // Multizone: la subvention et l’AHRI dépendent des têtes (murales seulement, gainables seulement, mixte)
  multi: [
    { model: 'KM18X6O', btu: 18000, seer2: 21, hspf2: 10, es: '3798991', breaker: 20, lines: '1/4 - 3/8', volt: 230, dims: '32-23/64 x 21-42/64 x 13-55/64', ahri: { wall: '215708441', ducted: '215708446', mixed: '215708451' }, subsidy: { wall: 2112, ducted: 1800, mixed: 1848 } },
    { model: 'KM24X6O', btu: 24000, seer2: 21, hspf2: 10, es: '3798992', breaker: 25, lines: '1/4 - 3/8', volt: 230, dims: '37-61/64 x 25-63/64 x 15-53/64', ahri: { wall: '215708442', ducted: '215708447', mixed: '215708452' }, subsidy: { wall: 2832, ducted: 2640, mixed: 2760 } },
    { model: 'KM30X6O', btu: 30000, seer2: 21, hspf2: 10, es: '3798993', breaker: 35, lines: '1/4 - 3/8', volt: 230, dims: '40-10/64 x 32-33/64 x 16-52/64', ahri: { wall: '215708443', ducted: '215708448', mixed: '215708453' }, subsidy: { wall: 3360, ducted: 3264, mixed: 3312 } },
    { model: 'KM36X6O', btu: 36000, seer2: 21, hspf2: 10, es: '3798994', breaker: 35, lines: '1/4 - 3/8', volt: 230, dims: '40-10/64 x 32-33/64 x 16-52/64', ahri: { wall: '215708444', ducted: '215708449', mixed: '215708454' }, subsidy: { wall: 4320, ducted: 4320, mixed: 4320 } },
    { model: 'KM42X6O', btu: 42000, seer2: 21, hspf2: 10, es: '3798995', breaker: 35, lines: '1/4 - 3/8', volt: 230, dims: '40-10/64 x 32-33/64 x 16-52/64', ahri: { wall: '215708445', ducted: '215708450', mixed: '215708455' }, subsidy: { wall: 5340, ducted: 4800, mixed: 4800 } },
    { model: 'KM48X6O', btu: 48000, seer2: 21, hspf2: 10, es: '3995741', breaker: null, lines: '', volt: 230, dims: '', ahri: { wall: '216772301', ducted: '216772302', mixed: '216772303' }, subsidy: { wall: 5340, ducted: 4800, mixed: 4800 } },
  ],
  // Têtes intérieures multizone (230 V)
  heads: [
    ['wall', 'Charmo', [['KW05HQ19CDI', 5000, '32-7/8 x 10-53/64 x 7-7/8'], ['KW07HQ19CDI', 7000, '32-7/8 x 10-53/64 x 7-7/8'], ['KW09HQ19CDI', 9000, '32-7/8 x 10-53/64 x 7-7/8'], ['KW12HQ19CDI', 12000, '32-7/8 x 10-53/64 x 7-7/8'], ['KW18HQ19CDI', 18000, '37-1/8 x 13-7/64 x 9-11/16'], ['KW24HQ19CDI', 24000, '42-7/16 x 13-7/64 x 9-11/16']]],
    ['wall', 'Clivia', [['KW09XQ25SDI', 9000, '35-14/32 x 10-55/64 x 8-10/64'], ['KW12XQ25SDI', 12000, '35-14/32 x 10-55/64 x 8-10/64'], ['KW18XQ25SDI', 18000, '39-15/16 x 13-1/8 x 9-15/16'], ['KW24XQ25SDI', 24000, '43-15/16 x 13-7/64 x 9-49/64']]],
    ['wall', 'Airy', [['KW09XQ29SDI', 9000, '38-3/16 x 13-21/32 x 10-1/8'], ['KW12XQ29SDI', 12000, '38-3/16 x 13-21/32 x 10-1/8'], ['KW18XQ29SDI', 18000, '43-45/64 x 13-21/32 x 10-1/8'], ['KW24XQ29SDI', 24000, '43-45/64 x 13-21/32 x 10-1/8']]],
    ['cassette', '', [['KM12XK8DI', 12000, ''], ['KM18XK8DI', 18000, ''], ['KM24XK8DI', 24000, ''], ['KM30XK8DI', 30000, ''], ['KM36XK8DI', 36000, '']]],
    ['oneway', '', [['KM09XK1DI', 9000, ''], ['KM12XK1DI', 12000, ''], ['KM18XK1DI', 18000, ''], ['KM20XK1DI', 20000, '']]],
    ['console', '', [['KM09XEDI', 9000, ''], ['KM12XEDI', 12000, ''], ['KM18XEDI', 18000, '']]],
    ['floorceiling', '', [['KM12XTDI', 12000, ''], ['KM18XTDI', 18000, ''], ['KM24XTDI', 24000, '']]],
    ['ducted', '', [['KM09XFDI', 9000, ''], ['KM12XFDI', 12000, ''], ['KM18XFDI', 18000, ''], ['KM24XFDI', 24000, '']]],
  ],
  // Ultranixx (centrale, souffleur multiposition): [tonnes, btu, seer2, hspf2, ahri, es, intérieur, disj. int., dims int., extérieur, disj. ext., dims ext., tuyaux, subvention]
  central: [
    [2, 24000, 16, 9.5, '217194944', '4011417', 'KD24UXI', 15, '18-1/8 x 21-1/4 x 43-1/2', 'KU36UXO', 25, '39 x 37-13/16 x 14-9/16', '3/8 - 3/4', 2472],
    [3, 36000, 16.5, 9.5, '217194945', '4011418', 'KD36UXI', 15, '21-1/4 x 48-3/16 x 21-1/4', 'KU36UXO', 30, '39 x 37-13/16 x 14-9/16', '3/8 - 3/4', 3384],
    [4, 48000, 17, 9.5, '217194946', '4011419', 'KD48UXI', 15, '24-13/16 x 52 x 21-1/4', 'KU60UXO', 45, '35-7/16 x 49-5/8 x 13-3/8', '3/8 - 3/4', 4740],
    [5, 60000, 16, 9, '217194947', '4011420', 'KD60UXI', 15, '24-13/16 x 52 x 21-1/4', 'KU60UXO', 45, '35-7/16 x 49-5/8 x 13-3/8', '3/8 - 3/4', 5400],
  ],
  // Case coil (add-on sur fournaise): seulement les combinaisons avec AHRI et subvention dans la liste
  addon: [
    { tons: 2, coil: 'KCAC24FI', outdoor: 'KU36UXO', ahri: '218046860', es: '4577690', subsidy: 1800 },
    { tons: 3, coil: 'KCAC36FI', outdoor: 'KU36UXO', ahri: '217603525', es: '4497871', subsidy: 3120 },
  ],
  elements: ['5', '6', '9', '10', '12', '15', '20'],
  extras: [{ name: 'MiniERV Kinghome (kit d’air frais)', model: 'MiniERV', fr: 'Ventilation bidirectionnelle procurant 17,6 PCM d’air frais (murale Clivia).', en: 'Two-way ventilation providing 17.6 CFM of fresh air (Clivia wall unit).', categories: ['wall'] },
    { name: 'Grille de cassette 4 voies – grande (24k)', model: '', fr: 'Grille pour cassette 4 voies 24 000 BTU.', en: 'Grille for 24,000 BTU 4-way cassette.', categories: ['heads'] },
    { name: 'Grille de cassette 4 voies – petite (12k et 18k)', model: '', fr: 'Grille pour cassette 4 voies 12 000 et 18 000 BTU.', en: 'Grille for 12,000 and 18,000 BTU 4-way cassette.', categories: ['heads'] },
    { name: 'Grille de cassette 1 voie', model: '', fr: 'Grille pour cassette 1 voie.', en: 'Grille for one-way cassette.', categories: ['heads'] }],
};

export const ZEPHYR = {
  warranty: { fr: '10 ans – pièces et compresseur', en: '10 years – parts and compressor' },
  ac: { ref: 'R-32', rows: W([
    [12000, 19, null, '216445274', '', 25, '1/4 - 3/8', 115, 'ZE12BB22I', '33-1/2 x 10-5/8 x 8-3/16', 'ZE12BB22O', '28-1/8 x 21-1/4 x 9-1/2', 0],
    [18000, 18, null, '216445275', '', 25, '1/4 - 1/2', 230, 'ZE18AB22I', '37-7/8 x 12-3/8 x 9', 'ZE18AB22O', '31-7/8 x 23 x 11', 0],
    [24000, 18, null, '216445276', '', 35, '3/8 - 5/8', 230, 'ZE24AB22I', '44-1/2 x 12-3/8 x 9', 'ZE24AB22O', '33-7/8 x 25-1/2 x 12-3/16', 0],
  ]) },
  wall: [
    { series: 'R-32', ref: 'R-32', rows: W([
      [9000, 20, 9, '215414827', '3624585', 25, '1/4 - 3/8', 115, 'ZE09DB22I', '33-1/2 x 10-5/8 x 8-3/16', 'ZE09DB22O', '28-1/8 x 21-1/4 x 9-1/2', 0],
      [12000, 18, 8.5, '215414828', '', 25, '1/4 - 3/8', 115, 'ZE12DB22I', '33-1/2 x 10-5/8 x 8-3/16', 'ZE12DB22O', '28-1/8 x 21-1/4 x 9-1/2', 0],
      [12000, 20, 8.5, '215414824', '', 15, '1/4 - 3/8', 230, 'ZE12CB22I', '33-1/2 x 10-5/8 x 8-3/16', 'ZE12CB22O', '28-1/8 x 21-1/4 x 9-1/2', 0],
      [18000, 21, 9.8, '215414825', '3624584', 20, '1/4 - 1/2', 230, 'ZE18CB22I', '44-1/2 x 12-3/8 x 9', 'ZE18CB22O', '31-7/8 x 23 x 11', 740],
      [24000, 19.5, 8.5, '215414826', '', 35, '3/8 - 5/8', 230, 'ZE24CB22I', '44-1/2 x 12-3/8 x 9', 'ZE24CB22O', '33-7/8 x 25-1/2 x 12-3/16', 0],
    ]) },
    { series: 'R-454B', ref: 'R-454B', rows: W([
      [9000, 25, 11, '215414829', '3624586', 15, '1/4 - 3/8', 230, 'ZE09CB25I', '33-1/2 x 10-5/8 x 8-3/16', 'ZE09CB25O', '31-7/8 x 23 x 11', 0],
      [12000, 22, 9.5, '215414834', '3624591', 25, '1/4 - 3/8', 115, 'ZE12DB25I', '33-1/2 x 10-5/8 x 8-3/16', 'ZE12DB25O', '31-7/8 x 23 x 11', 1116],
      [12000, 23, 10, '215414830', '3624587', 15, '1/4 - 3/8', 230, 'ZE12CB25I', '33-1/2 x 10-5/8 x 8-3/16', 'ZE12CB25O', '31-7/8 x 23 x 11', 1296],
      [18000, 21, 10, '215414831', '3624588', 30, '1/4 - 1/2', 230, 'ZE18CB25I', '44-1/2 x 12-3/8 x 9', 'ZE18CB25O', '33-7/8 x 25-1/2 x 12-3/16', 2160],
      [24000, 22.5, 9.5, '215414832', '3624589', 35, '3/8 - 5/8', 230, 'ZE24CB25I', '44-1/2 x 12-3/8 x 9', 'ZE24CB25O', '35-3/8 x 29-1/2 x 13-1/2', 2640],
    ]) },
    { series: 'Ultra-Heat', ref: 'R-454B', wifi: true, rows: W([
      [12000, 30, 11.8, '217596869', '4479236', 20, '1/4 - 1/2', 230, 'ZE12UB32I', '42-1/16 x 12-5/8 x 9-1/16', 'ZE12UB32O', '33-7/8 x 25-1/2 x 12-3/16', 1560],
      [15000, 25.6, 11.1, '217596870', '4479237', 20, '1/4 - 1/2', 230, 'ZE15UB32I', '42-1/16 x 12-5/8 x 9-1/16', 'ZE15UB32O', '33-7/8 x 25-1/2 x 12-3/16', 1560],
    ]) },
  ],
  multi: [
    { model: 'ZE518M225', btu: 18000, zones: 2, seer2: 22, hspf2: 10, ahri: '216684161', es: '3893663', breaker: 30, lines: '1/4 - 3/8', volt: 230, dims: '33-7/8 x 26-3/8 x 12-1/4', subsidy: 1380 },
    { model: 'ZE527M325', btu: 27000, zones: 3, seer2: 23, hspf2: 10, ahri: '216684164', es: '3893666', breaker: 40, lines: '1/4 - 3/8', volt: 230, dims: '38-3/8 x 32-7/8 x 14-1/8', subsidy: 2112 },
    { model: 'ZE536M425', btu: 36000, zones: 4, seer2: 22, hspf2: 10, ahri: '216684171', es: '3893671', breaker: 50, lines: '1/4 - 3/8', volt: 230, dims: '38-3/8 x 32-7/8 x 14-1/8', subsidy: 2712 },
    { model: 'ZE542M525', btu: 42000, zones: 5, seer2: 22, hspf2: 9.5, ahri: '216684168', es: '3893668', breaker: 60, lines: '1/4 - 3/8', volt: 230, dims: '38-3/8 x 32-7/8 x 14-1/8', subsidy: 3384 },
  ],
  heads: [['wall', '', [['ZE09CB25I', 9000, '33-1/2 x 10-5/8 x 8-3/16'], ['ZE12CB25I', 12000, '33-1/2 x 10-5/8 x 8-3/16'], ['ZE18CB25I', 18000, '44-1/2 x 12-3/8 x 9'], ['ZE24CB25I', 24000, '44-1/2 x 12-3/8 x 9']]]],
  central: [
    [2, 24000, 20, 10, '215381145', '3625084', 'AH624A', 10, '19-5/8 x 46-1/8 x 21-5/8', 'ZE624HPA', 35, '35-3/8 x 29-1/2 x 13-3/8', '3/8 - 5/8', 2448],
    [3, 36000, 19.5, 10.5, '215381146', '3625085', 'AH636A', 10, '19-5/8 x 46-1/8 x 21-5/8', 'ZE636HPA', 40, '43-1/4 x 34-1/2 x 17-3/4', '3/8 - 3/4', 3840],
    [4, 48000, 19, 9, '215381147', '3625086', 'AH648A', 15, '22 x 53-7/8 x 24', 'ZE648HPA', 50, '38-3/8 x 57-1/2 x 13', '3/8 - 7/8', 4392],
    [5, 60000, 19, 9, '215381148', '3625087', 'AH660A', 15, '22 x 53-7/8 x 24', 'ZE660HPA', 50, '38-3/8 x 57-1/2 x 13', '3/8 - 7/8', 4440],
  ],
  // Case coil Aspen (add-on), dimensions L x P x H
  addon: [
    { tons: 2, coil: 'DC31D2J', outdoor: 'ZE624HPA', ahri: '218160013', es: '4573275', subsidy: 2040, dims: '17-1/2 x 21-1/2 x 24' },
    { tons: 3, coil: 'DC37D3J', outdoor: 'ZE636HPA', ahri: '218160014', es: '4577857', subsidy: 3120, dims: '17-1/2 x 21-1/2 x 24' },
    { tons: 4, coil: 'DC49B3J', outdoor: 'ZE648HPA', ahri: '218160015', es: '4577856', subsidy: 3960, dims: '21 x 21-1/2 x 24' },
    { tons: 5, coil: 'DC61C4J', outdoor: 'ZE660HPA', ahri: '218160016', es: '4577855', subsidy: 4080, dims: '24-1/2 x 21-1/2 x 32' },
  ],
  elements: ['5', '7.5', '10', '15', '20'],
};
