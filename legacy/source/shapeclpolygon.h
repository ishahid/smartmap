#ifndef SHAPECLPOLYGON_H
#define SHAPECLPOLYGON_H

#include "shape.h"
#include "point.h"
#include "convert.h"
#include <qpainter.h>

class ShapeCLPolygon : public Shape {
private:
	Point* points;
	int numPoints;

public:
	ShapeCLPolygon( int id, QPtrList<Point>& plist );
	virtual QString coordinates();
	virtual void draw( double sf, QPainter& painter );
};

#endif
