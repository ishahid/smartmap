#ifndef SHAPECLLINE_H
#define SHAPECLLINE_H

#include "shape.h"
#include "point.h"
#include "convert.h"
#include <qpainter.h>

class ShapeCLLine : public Shape {
private:
	Point* points;
	int numPoints;
public:
	ShapeCLLine( int id, QPtrList<Point>& plist );
	virtual QString coordinates();
	virtual void draw( double sf, QPainter& painter );
};

#endif
