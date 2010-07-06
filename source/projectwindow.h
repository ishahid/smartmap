#ifndef PROJECTWINDOW_H
#define PROJECTWINDOW_H

#include <qmainwindow.h>

class MapWindow;
class QDomNode;

class ProjectWindow: public QMainWindow {
Q_OBJECT
public:
	ProjectWindow( QWidget* parent, const char* name, int wflags );
	~ProjectWindow();
	int layerCount();
	QString layerName( int index );
	bool isVisible( int layerIndex );

protected:
	void closeEvent( QCloseEvent * );
	void focusInEvent( QFocusEvent * );
	void _save();
	void traverseNode( QDomNode& );

signals:
	void message(const QString& );
	void message(const QString&, int );
	void layerAdded( QString&, int );
	void layerAddedAt( int, QString& );
	void layerRemoved( int );
	void emptyLayerPanel();
	void addLayerPanelItem( QString&, int, bool );
	void focused();
	void closed();
	void cosmeticLayer( bool );

public slots:
	void load( const QString& );
	void save();
	void saveAs();

	void cut();
	void copy();
	void paste();
	void del();
	void copyImageToFile();

	void addLayer();
	void addCosmeticLayer();
	void removeLayer();
	void layerManager();

	void zoomFull();
	void zoomIn();
	void zoomOut();
	void pan();
	void identify();

	void drawPoint();
	void drawLine();
	void drawCircle();
	void drawPolygon();

	void msg(const QString& );
    void msg(const QString&, int );
    void resendLayerRemoved( int );
    void resendLayerAddedAt( int, QString& );
    void resendCosmeticLayer( bool );
    void changeVisibility( int, bool );
    void setSaved( bool );

private:
    MapWindow *mapWindow;
    bool saved;
    bool firstSave;
    QString projName;

};

#endif
