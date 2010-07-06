#ifndef SHAPECLCIRCLE_H
#define SHAPECLCIRCLE_H

#include "shape.h"
#include "point.h"
#include "convert.h"
#include <qpainter.h>
#include <stdlib.h>

class ShapeCLCircle : public Shape {
private:
	Point center;
	Point radius;

public:
	ShapeCLCircle( int id, Point c, Point r );
	virtual QString coordinates();
	virtual void draw( double sf, QPainter& painter );
};

#endif
