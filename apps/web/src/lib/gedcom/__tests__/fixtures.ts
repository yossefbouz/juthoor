/**
 * Inline GEDCOM fixtures for parse/serialize/round-trip tests.
 *
 * Keep these small and readable — each one covers a single concept so
 * assertions can target exact structure.
 */

export const MINIMAL_GEDCOM = `0 HEAD
1 SOUR Juthoor
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ahmad /Bouz/
1 SEX M
1 BIRT
2 DATE 12 MAY 1920
2 PLAC Jerusalem
1 DEAT
2 DATE 1990
0 @I2@ INDI
1 NAME Fatima /Qasim/
1 SEX F
1 BIRT
2 DATE 1925
0 @I3@ INDI
1 NAME Sami /Bouz/
1 SEX M
1 BIRT
2 DATE 1950
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1945
0 TRLR
`;

export const MULTI_SPOUSE_GEDCOM = `0 HEAD
1 SOUR Juthoor
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Ahmad /Bouz/
1 SEX M
0 @I2@ INDI
1 NAME Mariam /Ali/
1 SEX F
0 @I3@ INDI
1 NAME Hafsa /Saleh/
1 SEX F
0 @I4@ INDI
1 NAME Yusuf /Bouz/
1 SEX M
0 @I5@ INDI
1 NAME Omar /Bouz/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I4@
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I3@
1 CHIL @I5@
0 TRLR
`;

export const ARABIC_UTF8_GEDCOM = `0 HEAD
1 SOUR Juthoor
1 CHAR UTF-8
0 @I1@ INDI
1 NAME أحمد /البوز/
1 SEX M
0 TRLR
`;

/** Minimal GEDCOM 7.0 fixture with SCHMA, TRAN/ROMN, IDNO, EVEN TYPE. */
export const GEDCOM7_MINIMAL = `0 HEAD
1 GEDC
2 VERS 7.0
1 SCHMA
2 TAG https://juthoor.org/gedcom/IDNO-UNRWA UNRWA
2 TAG https://juthoor.org/gedcom/EVEN-DISPLACEMENT DISPLACEMENT
1 SOUR Juthoor
0 @I1@ INDI
1 NAME أحمد /البوز/
2 TRAN أحمد /البوز/
3 LANG ar
2 ROMN Ahmad /Bouz/
1 SEX M
1 IDNO UNRWA-42
2 TYPE UNRWA
1 EVEN
2 TYPE DISPLACEMENT
2 DATE 1948
2 PLAC Lebanon
1 NOTE Short note
0 TRLR
`;
