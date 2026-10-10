#include "shapeclcircle.h"

ShapeCLCircle::ShapeCLCircle( int id, Point c, Point r ) {
	_shapeID = id;
	_type = 997;

	center.setX( c.x() - r.x() );
	center.setY( c.y() + r.y() );
	double diffx = abs( c.x() - r.x() );
	double diffy = abs( c.y() - r.y() );
	radius.setXY( diffx*2, diffy*2 );
}

QString
ShapeCLCircle::coordinates() {
	QString str = "";
	str += "      <Point X=\"" + QString::number( center.x(), 'f', 6 ) + "\" " +
						"Y=\"" + QString::number( center.y(), 'f', 6 ) + "\"/>\n";
	str += "      <Point X=\"" + QString::number( radius.x(), 'f', 6 ) + "\" " +
						"Y=\"" + QString::number( radius.y(), 'f', 6 ) + "\"/>\n";

	return str;
}

inline void
ShapeCLCircle::draw( double sf, QPainter& painter ) {
	painter.drawEllipse( Convert::degreeToPixelX( center.x(), sf ),
						 Convert::degreeToPixelY( center.y(), sf ),
						 Convert::degreeToPixelX( radius.x(), sf ),
						 Convert::degreeToPixelY( radius.y(), sf ) );
}
