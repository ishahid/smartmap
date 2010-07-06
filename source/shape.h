#ifndef SHAPE_H
#define SHAPE_H

#include "point.h"
#include <qpainter.h>
#include <qcolor.h>
#include <qstring.h>

class Shape {			// abstract class
protected:
	int _shapeID;
	int _type;

public:
	virtual int
	shapeID() {
		return _shapeID;
	}

	virtual int
	type() {
		return _type;
	}

	virtual QString coordinates() {
		// xml formatted sting of coordinates
		return "";
	}

	virtual void draw( double sf, QPainter& painter ) = 0;
};

#endif
