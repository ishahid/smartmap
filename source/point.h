#ifndef POINT_H
#define POINT_H

class Point {
protected:
	double _x;
	double _y;
public:
	Point( double px=0, double py=0 );
	double x();
	double y();
	void setX( double px );
	void setY( double py );
	void setXY( double px, double py );
};

#endif
