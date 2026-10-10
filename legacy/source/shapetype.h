#ifndef SHAPETYPE_H
#define SHAPETYPE_H

#include <qstring.h>

class ShapeType {
private:
	ShapeType();

public:
	static QString name( int type );
	static bool isValid( int type );
};

#endif
