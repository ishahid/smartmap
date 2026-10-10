#include "nullshape.h"

NullShape::NullShape( int id ) {
	_shapeID = id;
	_type = 0;
}

void
NullShape::draw( double sf, QPainter& painter ) {
	// NullShape is not drawn on the buffer
}
