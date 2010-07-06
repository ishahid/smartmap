#include "convert.h"

int		Convert::screenx = 872;
int		Convert::screeny = 636;
int		Convert::xmax = 180;
int		Convert::xmin = -180;
int		Convert::ymax = 90;
int		Convert::ymin = -90;
int		Convert::dx = Convert::xmax - Convert::xmin;
int		Convert::dy = Convert::ymax - Convert::ymin;
double	Convert::centerx = Convert::screenx / 2.0;	// it should be zero degree long/lat
double	Convert::centery = Convert::screeny / 2.0;	// or u can say, middle of the screen
double	Convert::diffx = Convert::screenx / Convert::dx;
double	Convert::diffy = Convert::screeny / Convert::dy;

void
Convert::init( int width, int height ) {
	screenx = width;				// 872
	screeny = height;				// 636
	xmax = 180;
	xmin = -180;
	ymax = 90;
	ymin = -90;
	dx = xmax - xmin;				// 360
	dy = ymax - ymin;				// 180
	centerx = screenx / 2.0;		// 436, it should be zero degree long/lat
	centery = screeny / 2.0;		// 318, or u can say, middle of the screen
	diffx = screenx / double(dx);	// 2.4222222222
	diffy = screeny / double(dy);	// 3.5333333333
}

void
Convert::reinit( int width, int height ) {
	screenx = width;
	screeny = height;
	xmax = 180;
	xmin = -180;
	ymax = 90;
	ymin = -90;
	dx = xmax - xmin;
	dy = ymax - ymin;
	diffx = screenx / double(dx);
	diffy = screeny / double(dy);
	//QMessageBox::information( 0, "Convert", "width = " + QString::number( screenx ) + " height = " + QString::number( screeny ), QMessageBox::Ok );
}

void
Convert::setCenter( double x, double y ) {
	centerx = x;
	centery = y;
	//QMessageBox::information( 0, "Convert", "centerx = " + QString::number( x ) + " centery = " + QString::number( y ), QMessageBox::Ok );
}

int
Convert::degreeToPixelX( double degree, double sf ) {
	int x = int( ( ( degree * sf ) * diffx ) + centerx );
	return x;
}

int
Convert::degreeToPixelY( double degree, double sf ) {
	int y = int( centery - ( ( degree * sf ) * diffy ) );
	return y;
}

double
Convert::pixelToDegreeX( int pixel, double sf ) {
	double currentx = pixel - centerx;
	currentx /= diffx;
	currentx /= sf;
	return currentx;
}

double
Convert::pixelToDegreeY( int pixel, double sf ) {
	double currenty = centery - pixel;
	currenty /= diffy;
	currenty /= sf;
	return currenty;
}
