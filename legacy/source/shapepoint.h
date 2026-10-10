#ifndef SHAPEPOINT_H
#define SHAPEPOINT_H

#include "shape.h"
#include "point.h"
#include "convert.h"
#include <qpainter.h>
#include <qstring.h>

class ShapePoint : public Shape {
private:
	Point point;
public:
	ShapePoint( int id, double x, double y );
	virtual QString coordinates();
	virtual void draw( double sf, QPainter& painter );
};

#endif
