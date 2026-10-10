#include "point.h"

Point::Point(double px, double py) {
	if ( px>=-180 && px<=180 ){
		_x = px;
	}else{
		_x = 0;
	}

	if ( py>=-90 && py<=90 ){
		_y = py;
	}else{
		_y = 0;
	}
}

double Point::x() {
	return _x;
}

double Point::y() {
	return _y;
}

void Point::setX(double px) {
	if ( px>=-180 && px<=180 ){
		_x = px;
	}else{
		_x = 0;
	}
}

void Point::setY(double py) {
	if ( py>=-90 && py<=90 ){
		_y = py;
	}else{
		_y = 0;
	}
}

void Point::setXY( double px, double py ) {
	if ( px>=-180 && px<=180 ){
			_x = px;
		}else{
			_x = 0;
	}
	if ( py>=-90 && py<=90 ){
			_y = py;
		}else{
			_y = 0;
	}
}
