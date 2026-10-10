#include "shapepoint.h"

ShapePoint::ShapePoint( int id, double x, double y ) {
	_shapeID = id;
	_type = 1;
	point.setXY( x, y );
}

QString
ShapePoint::coordinates() {
	QString str;
	str  = "      <Point X=\"" + QString::number( point.x(), 'f', 6 ) + "\" " +
						"Y=\"" + QString::number( point.y(), 'f', 6 ) + "\"/>\n";
	return str;
}

inline void
ShapePoint::draw( double sf, QPainter& painter ) {
	/****************************************************************************************
		drawEllipse draws an ellipse with center at (x + w/2, y + h/2) and size (w, h).
	****************************************************************************************/
	painter.drawEllipse( Convert::degreeToPixelX( point.x(), sf ),
						 Convert::degreeToPixelY( point.y(), sf ),
						 4,
						 4 );
}
