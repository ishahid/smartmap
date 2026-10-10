#ifndef MAPWINDOW_H
#define MAPWINDOW_H

#include "maplayer.h"
#include "mapcolors.h"
#include "projectwindow.h"
#include "cosmeticlayer.h"
#include "shape.h"
#include "shapetype.h"
#include "nullshape.h"
#include "shapepoint.h"
#include "shapepolygon.h"
#include "shapepolyline.h"
#include "shapeclpolygon.h"
#include "shapeclline.h"
#include <qframe.h>
#include <qptrlist.h>
#include <qpixmap.h>
#include <qpoint.h>
#include <qrect.h>
#include <qcursor.h>
#include <qpainter.h>
#include <qmessagebox.h>

class MapWindow : public QFrame {
Q_OBJECT
public:
	// Drawing Modes of the MapWindow
    enum DrawMode {
		NormalMode		= 0,
		ZoomInMode		= 1,
		ZoomOutMode		= 2,
		ZoomFullMode	= 3,
		PanMode			= 4,
		IdentifyMode	= 5,
		PointMode		= 6,
		LineMode		= 7,
		CircleMode		= 8,
		PolygonMode		= 9,
		BitmapMode		= 10
	};

public:
    MapWindow( ProjectWindow* parent, const char* name );
    virtual ~MapWindow();
    double scaleFactor();
    QPoint panXY();
    DrawMode mode();
    void setMode( DrawMode m );
    int layerCount();
    QString layerName( int index );
    bool isVisible( int layerIndex );
    QString shpPath( int index );
    QString cosmeticLayerPath();
    bool isCosmeticLayerOn();

protected:
    void paintEvent( QPaintEvent *e );
    void resizeEvent ( QResizeEvent *);
	void mousePressEvent(QMouseEvent *);
	void mouseMoveEvent(QMouseEvent *);
	void mouseReleaseEvent ( QMouseEvent *);

signals:
    void layerAdded();
    void layerAddedAt( int, QString& );
    void layerRemoved( int );
    void scaleFactorChanged();
    void scaleFactorChangedTo( double newSF );
    void message(const QString&, int );
    void message(const QString& );
    void cosmeticLayer( bool );

public slots:
	void addLayer( QString& shapefile );
	void addLayer( MapLayer* layer );
	void addLayerAt( MapLayer* layer, int index );
	void removeLayer( int index );
	MapLayer* layerAt( int index );
	void draw();
	void setScaleFactor( double newSF );
	void setDefaults();
	QColor fillColor( int index );
	QColor lineColor( int index );
	void setFillColor( int index, QColor& color );
	void setLineColor( int index, QColor& color );
	void setVisible( int index, bool flag );
	void copyImageToFile( QString& fn );
	void setPanXY( int x, int y );
	void addCosmeticLayer( QString& scl );
	void readCosmeticLayer( QString& scl );
	void saveCosmeticLayer();

private:
	bool isButtonPressed;
	bool firstDraw;
	double _scaleFactor;
	DrawMode _mode;
	MapColors mapColors;			// Defines the colors to be used as default
	QPoint lastPoint;
	QPoint currPoint;
	QPoint panPoint;
	QPoint lineFromPoint;
	QPoint lineToPoint;
	QPoint tempPoint;
	QPixmap buffer;
	QPainter painter;
	QPtrList<MapLayer> *layers;
	CosmeticLayer *cLayer;
};

#endif
