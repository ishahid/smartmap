#ifndef NULLSHAPE_H
#define NULLSHAPE_H

#include "shape.h"

class NullShape : public Shape {
public:
	NullShape( int id );
	virtual void draw( double sf, QPainter& painter );
};

#endif
