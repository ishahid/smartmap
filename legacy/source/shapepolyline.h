#ifndef SHAPEPOLYLINE_H
#define SHAPEPOLYLINE_H

#include "shape.h"
#include "point.h"
#include "convert.h"
#include <qpainter.h>

class ShapePolyLine : public Shape {
private:
	Point* points;
	int* parts;
	int numPoints;
	int numParts;
	double box[4];
public:
	ShapePolyLine( int id, double* box, int numParts, int numPoints, int* parts, double* x, double* y );
	virtual void draw( double sf, QPainter& painter );
};

#endif
