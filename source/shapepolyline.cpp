#include "shapepolyline.h"

ShapePolyLine::ShapePolyLine( int id, double* box, int numParts, int numPoints, int* parts, double* x, double* y ) {
	_shapeID = id;
	_type = 3;

	this->numParts = numParts;
	this->numPoints = numPoints;
	this->box[0] = box[0];
	this->box[0] = box[0];
	this->box[0] = box[0];
	this->box[0] = box[0];

	this->parts = new int[numParts];
	this->points = new Point[numPoints];

	int i;
	for( i=0; i<numParts; i++ ) {
		this->parts[i] = parts[i];
	}
	for( i=0; i<numPoints; i++ ) {
		this->points[i].setXY( x[i], y[i] );
	}
}

inline void
ShapePolyLine::draw( double sf, QPainter& painter ) {
	int length, pIdx = 0, i;

	QPointArray pArray( this->numPoints );

	for ( i=0; i<numPoints; i++ ) {
		int X = Convert::degreeToPixelX( points[pIdx].x(), sf );
		int Y = Convert::degreeToPixelY( points[pIdx].y(), sf );
		pArray.setPoint( i, X, Y );
		pIdx++;
	}

	for ( i=0; i<numParts; i++ ) {
		if (numParts == 1) {
			length = numPoints;
		} else {
			if ( (i+1) < numParts )
				length = parts[i+1] - parts[i];
			else
				length = numPoints - parts[i];
		}

		painter.drawPolyline( pArray, parts[i], length );
	}
}
