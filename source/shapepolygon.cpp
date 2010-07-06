#include "shapepolygon.h"

ShapePolygon::ShapePolygon( int id, double* box, int numParts, int numPoints, int* parts, double* x, double* y ) {
	_shapeID = id;
	_type = 5;

	this->numParts = numParts;
	this->numPoints = numPoints;
	this->box[0] = box[0];
	this->box[0] = box[0];
	this->box[0] = box[0];
	this->box[0] = box[0];

	this->parts = new int[numParts];
	this->points = new Point[numPoints];

	for( int i=0; i<numParts; i++ ) {
		this->parts[i] = parts[i];
	}
	for( i=0; i<numPoints; i++ ) {
		this->points[i].setXY( x[i], y[i] );
	}
}

inline void
ShapePolygon::draw( double sf, QPainter& painter ) {
	int length, pIdx = 0;

	for ( int i=0; i<numParts; i++ ) {
		if (numParts == 1) {
			length = numPoints;
		} else {
			if ( (i+1) < numParts )
				length = parts[i+1] - parts[i];
			else
				length = numPoints - parts[i];
		}


		QPointArray pArray( length );

		for ( int j=0; j<length; j++ ) {
			int X = Convert::degreeToPixelX( points[pIdx].x(), sf );
			int Y = Convert::degreeToPixelY( points[pIdx].y(), sf );
			pArray.setPoint( j, X, Y );
			pIdx++;
		}
		painter.drawPolygon( pArray );
	}
}
