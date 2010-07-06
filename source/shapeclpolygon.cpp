#include "shapeclpolygon.h"

ShapeCLPolygon::ShapeCLPolygon( int id, QPtrList<Point>& plist ) {
	_shapeID = id;
	_type = 998;

	numPoints = plist.count();
	points = new Point[numPoints];

	for( int i=0; i<numPoints; i++ ) {
		this->points[i].setXY( plist.at(i)->x(), plist.at(i)->y() );
	}
}

QString
ShapeCLPolygon::coordinates() {
	QString str = "";
	for ( int i=0; i<numPoints; i++ ) {
		str += "      <Point X=\"" + QString::number( points[i].x(), 'f', 6 ) + "\" " +
							"Y=\"" + QString::number( points[i].y(), 'f', 6 ) + "\"/>\n";
	}
	return str;
}

inline void
ShapeCLPolygon::draw( double sf, QPainter& painter ) {
	QPointArray pArray( numPoints );

	for ( int i=0; i<numPoints; i++ ) {
		int X = Convert::degreeToPixelX( points[i].x(), sf );
		int Y = Convert::degreeToPixelY( points[i].y(), sf );
		pArray.setPoint( i, X, Y );
	}

	painter.drawPolygon( pArray );
}
