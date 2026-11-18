# Difficulty tiers

Generated 2026-11-03 by `tools/build.mjs` from `data/countries.json` values. Edit the thresholds or the
`FAMOUS` list in `tools/tiers.mjs` and rebuild; do not hand-edit this file.

## Rule

Ranks are computed among the 195 playable states only (1 = largest). A missing value has no rank.

- **Tier 1** (Easy): population rank ≤ 25, or area rank ≤ 15, or GDP rank ≤ 25, or in the editorial `FAMOUS` list.
- **Tier 2** (Normal adds these): not tier 1, and population rank ≤ 90, or area rank ≤ 80, or GDP rank ≤ 90.
- **Tier 3** (Hard adds these): everything else.

Inputs: population = World Bank SP.POP.TOTL (latest year), area = mledoze `area` (km²), GDP = World Bank NY.GDP.MKTP.CD (latest year, current US$).
`FAMOUS` (editorial judgement, the only non-mechanical input): AFG, AUT, CHL, COL, CUB, DNK, FIN, GRC, IRQ, ISL, ISR, JAM, KEN, MAR, MDG, MNG, NOR, NZL, PER, PRK, PRT, UKR, VEN.

Each line shows population/area/GDP rank.

## Tier 1 (63)

- Afghanistan (AFG) 36/40/137 — famous
- Algeria (DZA) 33/10/50 — area #10
- Argentina (ARG) 35/8/24 — area #8, GDP #24
- Australia (AUS) 55/6/15 — area #6, GDP #15
- Austria (AUT) 97/113/28 — famous
- Bangladesh (BGD) 8/92/37 — pop #8
- Belgium (BEL) 81/136/22 — GDP #22
- Brazil (BRA) 7/5/11 — pop #7, area #5, GDP #11
- Canada (CAN) 38/2/10 — area #2, GDP #10
- Chile (CHL) 65/37/44 — famous
- China (CHN) 2/3/2 — pop #2, area #3, GDP #2
- Colombia (COL) 28/25/36 — famous
- Cuba (CUB) 87/104/71 — famous
- Denmark (DNK) 113/130/35 — famous
- DR Congo (COD) 15/11/80 — pop #15, area #11
- Egypt (EGY) 13/29/42 — pop #13
- Ethiopia (ETH) 10/26/65 — pop #10
- Finland (FIN) 116/65/47 — famous
- France (FRA) 23/48/7 — pop #23, GDP #7
- Germany (DEU) 19/62/3 — pop #19, GDP #3
- Greece (GRC) 93/95/51 — famous
- Iceland (ISL) 172/106/104 — famous
- India (IND) 1/7/6 — pop #1, area #7, GDP #6
- Indonesia (IDN) 4/14/17 — pop #4, area #14, GDP #17
- Iran (IRN) 17/17/43 — pop #17
- Iraq (IRQ) 34/58/53 — famous
- Ireland (IRL) 120/118/23 — GDP #23
- Israel (ISR) 95/149/26 — famous
- Italy (ITA) 25/72/9 — pop #25, GDP #9
- Jamaica (JAM) 138/159/124 — famous
- Japan (JPN) 12/61/4 — pop #12, GDP #4
- Kazakhstan (KAZ) 64/9/48 — area #9
- Kenya (KEN) 26/47/61 — famous
- Madagascar (MDG) 49/45/134 — famous
- Mexico (MEX) 11/13/14 — pop #11, area #13, GDP #14
- Mongolia (MNG) 131/18/121 — famous
- Morocco (MAR) 41/57/57 — famous
- Netherlands (NLD) 71/131/18 — GDP #18
- New Zealand (NZL) 123/75/52 — famous
- Nigeria (NGA) 6/31/49 — pop #6
- North Korea (PRK) 56/97/- — famous
- Norway (NOR) 117/68/31 — famous
- Pakistan (PAK) 5/33/40 — pop #5
- Peru (PER) 48/19/46 — famous
- Philippines (PHL) 14/63/33 — pop #14
- Poland (POL) 44/70/21 — GDP #21
- Portugal (PRT) 89/109/45 — famous
- Russia (RUS) 9/1/8 — pop #9, area #1, GDP #8
- Saudi Arabia (SAU) 43/12/19 — area #12, GDP #19
- South Africa (ZAF) 24/24/39 — pop #24
- South Korea (KOR) 29/107/13 — GDP #13
- Spain (ESP) 32/51/12 — GDP #12
- Sudan (SDN) 30/15/90 — area #15
- Sweden (SWE) 92/55/25 — GDP #25
- Switzerland (CHE) 98/132/20 — GDP #20
- Tanzania (TZA) 21/30/82 — pop #21
- Thailand (THA) 20/50/29 — pop #20
- Türkiye (TUR) 18/36/16 — pop #18, GDP #16
- Ukraine (UKR) 40/44/56 — famous
- United Kingdom (GBR) 22/78/5 — pop #22, GDP #5
- United States (USA) 3/4/1 — pop #3, area #4, GDP #1
- Venezuela (VEN) 53/32/77 — famous
- Vietnam (VNM) 16/66/32 — pop #16

## Tier 2 (67)

- Angola (AGO) 39/22/67
- Azerbaijan (AZE) 94/112/86
- Belarus (BLR) 99/84/79
- Benin (BEN) 75/100/122
- Bolivia (BOL) 78/27/87
- Botswana (BWA) 141/46/133
- Bulgaria (BGR) 110/103/62
- Burkina Faso (BFA) 59/74/117
- Burundi (BDI) 77/142/165
- Cambodia (KHM) 72/88/93
- Cameroon (CMR) 51/53/91
- Central African Republic (CAF) 118/42/167
- Chad (TCD) 63/20/130
- Costa Rica (CRI) 125/126/73
- Croatia (HRV) 129/124/72
- Czechia (CZE) 88/115/41
- Dominican Republic (DOM) 84/128/64
- Ecuador (ECU) 70/73/63
- Gabon (GAB) 140/76/131
- Ghana (GHA) 47/80/68
- Guatemala (GTM) 69/105/66
- Guinea (GIN) 74/77/115
- Haiti (HTI) 82/143/110
- Honduras (HND) 86/101/103
- Hungary (HUN) 96/108/54
- Ivory Coast (CIV) 50/69/76
- Jordan (JOR) 83/110/89
- Kuwait (KWT) 126/152/58
- Libya (LBY) 104/16/99
- Lithuania (LTU) 137/121/78
- Luxembourg (LUX) 163/168/74
- Malawi (MWI) 60/98/146
- Malaysia (MYS) 45/67/34
- Mali (MLI) 58/23/112
- Mauritania (MRT) 124/28/151
- Mozambique (MOZ) 46/35/126
- Myanmar (MMR) 27/39/84
- Namibia (NAM) 134/34/144
- Nepal (NPL) 52/93/101
- Niger (NER) 54/21/128
- Oman (OMN) 119/71/69
- Panama (PAN) 127/116/81
- Papua New Guinea (PNG) 91/54/109
- Paraguay (PRY) 106/59/96
- Qatar (QAT) 136/158/55
- Republic of the Congo (COG) 109/64/141
- Romania (ROU) 67/81/38
- Rwanda (RWA) 76/144/140
- Senegal (SEN) 68/86/106
- Serbia (SRB) 108/111/75
- Singapore (SGP) 112/176/27
- Slovakia (SVK) 121/127/59
- Slovenia (SVN) 146/150/85
- Somalia (SOM) 66/41/147
- South Sudan (SSD) 80/43/149
- Sri Lanka (LKA) 62/120/70
- Syria (SYR) 57/87/123
- Tajikistan (TJK) 90/94/138
- Tunisia (TUN) 79/91/92
- Turkmenistan (TKM) 103/52/95
- Uganda (UGA) 31/79/88
- United Arab Emirates (ARE) 85/114/30
- Uruguay (URY) 132/89/83
- Uzbekistan (UZB) 42/56/60
- Yemen (YEM) 37/49/129
- Zambia (ZMB) 61/38/114
- Zimbabwe (ZWE) 73/60/94

## Tier 3 (65)

- Albania (ALB) 144/140/111
- Andorra (AND) 185/179/163
- Antigua and Barbuda (ATG) 184/182/174
- Armenia (ARM) 135/138/113
- Bahamas (BHS) 171/155/143
- Bahrain (BHR) 150/173/97
- Barbados (BRB) 174/183/155
- Belize (BLZ) 170/147/166
- Bhutan (BTN) 162/133/164
- Bosnia and Herzegovina (BIH) 133/125/108
- Brunei (BRN) 169/164/145
- Cape Verde (CPV) 168/166/168
- Comoros (COM) 159/170/178
- Cyprus (CYP) 152/162/102
- Djibouti (DJI) 157/146/161
- Dominica (DMA) 186/174/186
- El Salvador (SLV) 111/148/107
- Equatorial Guinea (GNQ) 147/141/148
- Eritrea (ERI) 130/99/175
- Estonia (EST) 154/129/100
- Eswatini (SWZ) 155/153/160
- Fiji (FJI) 158/151/158
- Gambia (GMB) 139/160/170
- Georgia (GEO) 128/119/105
- Grenada (GRD) 180/185/180
- Guinea-Bissau (GNB) 145/134/172
- Guyana (GUY) 161/83/118
- Kiribati (KIR) 178/172/189
- Kyrgyzstan (KGZ) 105/85/125
- Laos (LAO) 102/82/136
- Latvia (LVA) 148/122/98
- Lebanon (LBN) 114/161/119
- Lesotho (LSO) 142/137/171
- Liberia (LBR) 115/102/159
- Liechtenstein (LIE) 188/190/154
- Maldives (MDV) 167/187/156
- Malta (MLT) 166/186/116
- Marshall Islands (MHL) 190/189/191
- Mauritius (MUS) 156/169/142
- Micronesia (FSM) 181/177/188
- Moldova (MDA) 143/135/132
- Monaco (MCO) 189/194/152
- Montenegro (MNE) 165/156/153
- Nauru (NRU) 193/193/192
- Nicaragua (NIC) 107/96/127
- North Macedonia (MKD) 149/145/135
- Palau (PLW) 192/180/190
- Palestine (PSE) 122/163/139
- Saint Kitts and Nevis (KNA) 187/188/184
- Saint Lucia (LCA) 177/178/169
- Saint Vincent and the Grenadines (VCT) 183/184/183
- Samoa (WSM) 176/167/182
- San Marino (SMR) 191/191/176
- São Tomé and Príncipe (STP) 175/171/185
- Seychelles (SYC) 179/181/173
- Sierra Leone (SLE) 100/117/157
- Solomon Islands (SLB) 160/139/179
- Suriname (SUR) 164/90/162
- Timor-Leste (TLS) 151/154/177
- Togo (TGO) 101/123/150
- Tonga (TON) 182/175/187
- Trinidad and Tobago (TTO) 153/165/120
- Tuvalu (TUV) 194/192/193
- Vanuatu (VUT) 173/157/181
- Vatican City (VAT) -/195/-
