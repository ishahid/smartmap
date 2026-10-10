#include "mapcolors.h"

MapColors::MapColors() {
	nFColors = 60;
	nLColors = 20;

	fillColors = new QColor[nFColors];
	lineColors = new QColor[nLColors];

	fillColors[0]  = QColor( 153, 204,  51 );	// YellowGreen
	fillColors[1]  = QColor( 255, 255,   0 );	// Yellow
	fillColors[2]  = QColor( 245, 245, 245 );	// WhiteSmoke
	fillColors[3]  = QColor( 245, 122, 179 );	// Wheat
	fillColors[4]  = QColor( 238, 130, 238 );	// Violet
	fillColors[5]  = QColor( 216, 191, 216 );	// Thistle
	fillColors[6]  = QColor( 210, 180, 140 );	// Tan
	fillColors[7]  = QColor( 106,  90, 205 );	// SlateBlue
	fillColors[8]  = QColor( 135, 206, 235 );	// SkyBlue
	fillColors[9]  = QColor( 192, 192, 192 );	// Silver
	fillColors[10] = QColor( 255, 245, 238 );	// SeaShell
	fillColors[11] = QColor( 244, 164,  96 );	// SandyBrown
	fillColors[12] = QColor( 188, 143, 143 );	// RosyBrown
	fillColors[13] = QColor( 176, 224, 230 );	// PowderBlue
	fillColors[14] = QColor( 221, 160, 221 );	// Plum
	fillColors[15] = QColor( 255, 192, 203 );	// Pink
	fillColors[16] = QColor( 205, 133,  63 );	// Peru
	fillColors[17] = QColor( 255, 218, 185 );	// Peachpuff
	fillColors[18] = QColor( 255, 239, 213 );	// PapayaWhip
	fillColors[19] = QColor( 238, 232, 170 );	// PaleGoldenrod
	fillColors[20] = QColor( 253, 245, 230 );	// Oldlace
	fillColors[21] = QColor( 255, 222, 173 );	// NavajoWhite
	fillColors[22] = QColor( 255, 228, 225 );	// MistyRose
	fillColors[23] = QColor(   0, 250, 154 );	// MediumSpringGreen
	fillColors[24] = QColor( 123, 104, 238 );	// MediumSlateBlue
	fillColors[25] = QColor( 250, 240, 230 );	// Linen
	fillColors[26] = QColor(  51, 204,  51 );	// LimeGreen
	fillColors[27] = QColor(   0, 255,   0 );	// Lime
	fillColors[28] = QColor( 255, 255, 224 );	// LightYellow
	fillColors[29] = QColor( 176, 196, 222 );	// LightSteelBlue
	fillColors[30] = QColor( 135, 206, 250 );	// LightSkyBlue
	fillColors[31] = QColor( 255, 160, 122 );	// LightSalmon
	fillColors[32] = QColor( 255, 182, 193 );	// LightPink
	fillColors[33] = QColor( 144, 238, 144 );	// LightGreen
	fillColors[34] = QColor( 211, 211, 211 );	// LightGray
	fillColors[35] = QColor( 250, 250, 210 );	// LightGoldenrodYellow
	fillColors[36] = QColor( 173, 216, 230 );	// LightBlue
	fillColors[37] = QColor( 255, 240, 245 );	// LavenderBlush
	fillColors[38] = QColor( 230, 230, 250 );	// Lavender
	fillColors[39] = QColor( 240, 230, 140 );	// Khaki
	fillColors[40] = QColor( 173, 255,  47 );	// GreenYellow
	fillColors[41] = QColor( 255, 215,   0 );	// Gold
	fillColors[42] = QColor( 248, 248, 255 );	// GhostWhite
	fillColors[43] = QColor( 220, 220, 220 );	// Gainsboro
	fillColors[44] = QColor( 255, 250, 240 );	// FloralWhite
	fillColors[45] = QColor(  30, 144, 255 );	// DodgerBlue
	fillColors[46] = QColor(   0, 191, 255 );	// DeepSkyBlue
	fillColors[47] = QColor( 255, 140,   0 );	// DarkOrange
	fillColors[48] = QColor( 189, 183, 107 );	// DarkKhaki
	fillColors[49] = QColor( 255, 248, 220 );	// Cornsilk
	fillColors[50] = QColor( 100, 149, 237 );	// CornflowerBlue
	fillColors[51] = QColor( 255, 127,  80 );	// Coral
	fillColors[52] = QColor( 127, 255,   0 );	// Chartreuse
	fillColors[53] = QColor( 222, 184, 135 );	// Burlywood
	fillColors[54] = QColor( 245, 245, 220 );	// Beige
	fillColors[55] = QColor( 240, 255, 255 );	// Azure
	fillColors[56] = QColor( 127, 255, 212 );	// Aquamarine
	fillColors[57] = QColor( 250, 235, 215 );	// AntiqueWhite
	fillColors[58] = QColor( 240, 248, 255 );	// AliceBlue
	fillColors[59] = QColor( 255, 255, 255 );	// White

	lineColors[0]  = QColor( 112, 128, 144 );	// SlateGray
	lineColors[1]  = QColor( 160,  82,  45 );	// Sienna
	lineColors[2]  = QColor( 139,  69,  19 );	// SaddleBrown
	lineColors[3]  = QColor( 128,   0, 128 );	// purple
	lineColors[4]  = QColor(   0,   0, 128 );	// Navy
	lineColors[5]  = QColor(  25,  25, 112 );	// MidnightBlue
	lineColors[6]  = QColor( 128,   0,   0 );	// Maroon
	lineColors[7]  = QColor(  75,   0, 130 );	// Indigo
	lineColors[8]  = QColor( 178,  34,  34 );	// Firebrick
	lineColors[9]  = QColor( 105, 105, 105 );	// DimGray
	lineColors[10] = QColor(  47,  79,  79 );	// DarkSlateGray
	lineColors[11] = QColor(  72,  61, 139 );	// DarkSlateBlue
	lineColors[12] = QColor( 139,   0,   0 );	// DarkRed
	lineColors[13] = QColor(  85, 107,  47 );	// DarkOliveGreen
	lineColors[14] = QColor( 139,   0, 139 );	// DarkMagenta
	lineColors[15] = QColor(   0, 102,   0 );	// DarkGreen
	lineColors[16] = QColor(  51, 102, 102 );	// DarkForestGreen
	lineColors[17] = QColor(   0,   0, 139 );	// DarkBlue
	lineColors[18] = QColor( 165,  42,  42 );	// Brown
	lineColors[19] = QColor(   0,   0,   0 );	// Black

	QTime midnight( 0, 0, 0 );
    srand( midnight.secsTo( QTime::currentTime() ) );
}

QColor
MapColors::fillColor() {
	return fillColors[ rand() % nFColors ];
}

QColor
MapColors::lineColor() {
	return lineColors[ rand() % nLColors ];
}
