#include "shapetype.h"

QString ShapeType::name( int type ) {
	switch (type) {
		case 0:		return "Null Shape";
		case 1:		return "Point";
		case 3:		return "PolyLine";
		case 5:		return "Polygon";
		case 8:		return "MultiPoint";
		case 11:	return "PointZ";
		case 13:	return "PolyLineZ";
		case 15:	return "PolygonZ";
		case 18:	return "MultiPointZ";
		case 21:	return "PointM";
		case 23:	return "PolyLineM";
		case 25:	return "PolygonM";
		case 28:	return "MultiPointM";
		case 31:	return "MultiPatch";
		case 996:	return "SmartMap Cosmetic Layer Line";
		case 997:	return "SmartMap Cosmetic Layer Circle";
		case 998:	return "SmartMap Cosmetic Layer Polygon";
		case 999:	return "SmartMap Cosmetic Layer Bitmap";
		default:	return "Unsupported Shape";
	};
}

bool ShapeType::isValid( int type ) {
	bool flag;
	switch (type) {
		case 0:		flag = true; break;
		case 1:		flag = true; break;
		case 3:		flag = true; break;
		case 5:		flag = true; break;
		case 8:		flag = true; break;
		case 11:	flag = true; break;
		case 13:	flag = true; break;
		case 15:	flag = true; break;
		case 18:	flag = true; break;
		case 21:	flag = true; break;
		case 23:	flag = true; break;
		case 25:	flag = true; break;
		case 28:	flag = true; break;
		case 31:	flag = true; break;
		case 996:	flag = true; break;
		case 997:	flag = true; break;
		case 998:	flag = true; break;
		case 999:	flag = true; break;
		default:	flag = false; break;
	};
	return flag;
}
